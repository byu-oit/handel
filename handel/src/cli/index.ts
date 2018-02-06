/*
 * Copyright 2018 Brigham Young University
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import * as inquirer from 'inquirer';
import * as yaml from 'js-yaml';
import * as winston from 'winston';
import config from '../account-config/account-config';
import * as stsCalls from '../aws/sts-calls';
import {TAG_KEY_PATTERN, TAG_VALUE_MAX_LENGTH} from '../common/tagging-common';
import * as util from '../common/util';
import {
    AccountConfig, EnvironmentResult, HandelFile, HandelFileParser, ServiceDeployers,
    Tags
} from '../datatypes';
import * as checkLifecycle from '../lifecycles/check';
import * as deleteLifecycle from '../lifecycles/delete';
import * as deployLifecycle from '../lifecycles/deploy';

function configureLogger(argv: any) {
    let level = 'info';
    if (argv.d) {
        level = 'debug';
    }
    winston!.level = level;
    winston.cli();
}

function logCaughtError(msg: string, err: Error) {
    winston.error(`${msg}: ${err.message}`);
    if (winston.level === 'debug') {
        winston.error(err.toString());
    }
}

function logFinalResult(lifecycleName: string, envResults: EnvironmentResult[]): void {
    let success = true;
    for (const envResult of envResults) {
        if (envResult.status !== 'success') {
            winston.error(`Error during environment ${lifecycleName}: ${envResult.message}`);
            if (winston.level === 'debug' && envResult.error) {
                winston.error(envResult.error.toString());
            }
            success = false;
        }
    }

    if (success) {
        winston.info(`Finished ${lifecycleName} successfully`);
    }
    else {
        winston.error(`Finished ${lifecycleName} with errors`);
        process.exit(1);
    }
}

async function validateLoggedIn(): Promise<void> {
    AWS.config.update({ // Just use us-east-1 while we check that we are logged in.
        region: 'us-east-1'
    });
    const accountId = await stsCalls.getAccountId();
    if (!accountId) {
        winston.error(`You are not logged into an AWS account`);
        process.exit(1);
    }
}

async function validateCredentials(accountConfig: AccountConfig) {
    const deployAccount = accountConfig.account_id;
    winston.debug(`Checking that current credentials match account ${deployAccount}`);
    const discoveredId = await stsCalls.getAccountId();
    if(!discoveredId) {
        winston.error(`You are not logged into an AWS account`);
        process.exit(1);
    }

    winston.debug(`Currently logged in under account ${discoveredId}`);
    // tslint:disable-next-line:triple-equals
    if (deployAccount == parseInt(discoveredId!, 10)) {
        return;
    }
    else {
        winston.error(`You are trying to deploy to the account ${deployAccount}, but you are logged into the account ${discoveredId}`);
        process.exit(1);
    }
}

function validateHandelFile(handelFileParser: HandelFileParser, handelFile: HandelFile, serviceDeployers: ServiceDeployers): void {
    const errors = handelFileParser.validateHandelFile(handelFile, serviceDeployers);
    if (errors.length > 0) {
        winston.error(`The following errors were found in your Handel file:`);
        // tslint:disable-next-line:no-console
        console.log('  ' + errors.join('\n  '));
        process.exit(1);
    }
}

function validateAccountConfigParam(accountConfigParam: string): string[] {
    const errors = [];
    if (!fs.existsSync(accountConfigParam)) { // If not a path, check whether it's base64 encoded json
        try {
            yaml.safeLoad(new Buffer(accountConfigParam, 'base64').toString());
        }
        catch (e) {
            errors.push('Account config must be either a valid path to a file, or a base64 encoded JSON string');
        }
    }
    return errors;
}

function validateEnvsInHandelFile(envsToDeploy: string, handelFile: HandelFile) {
    const errors = [];
    const envsArray = envsToDeploy.split(',');
    for (const env of envsArray) {
        if (!handelFile.environments || !handelFile.environments[env]) {
            errors.push(`Environment '${env}' was not found in your Handel file`);
        }
    }
    return errors;
}

function parseTagsArg(tagsArg: string | undefined): Tags {
   if (!tagsArg) {
       return {};
   }
   return tagsArg.split(',')
       .reduce((tags: Tags, pair: string) => {
           const matched = pair.match(TAG_PARAM_PATTERN);
           if (!matched) {
               throw new Error('Invalid value for -t');
           }
           tags[matched[1]] = matched[2];
           return tags;
       }, {});
}

async function confirmDelete(envName: string, forceDelete: boolean): Promise<boolean> {
    if (forceDelete) {
        return true;
    }
    else {
        const warnMsg = `
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
WARNING: YOU ARE ABOUT TO DELETE YOUR HANDEL ENVIRONMENT '${envName}'!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

If you choose to delete this environment, you will lose all data stored in the environment!

In particular, you will lose all data in the following:

* Databases
* Caches
* S3 Buckets
* EFS Mounts

PLEASE REVIEW this environment thoroughly, as you are responsible for all data loss associated with an accidental deletion.
PLEASE BACKUP your data sources before deleting this environment just to be safe.
`;
        // tslint:disable-next-line:no-console
        console.log(warnMsg);

        const questions = [
            {
                type: 'input',
                name: 'confirmDelete',
                message: `Enter 'yes' to delete your environment. Handel will refuse to delete the environment with any other answer:`
            }
        ];
        const answers = await inquirer.prompt(questions);
        if (answers.confirmDelete === 'yes') {
            return true;
        }
        else {
            return false;
        }
    }
}

const TAG_PARAM_PATTERN = RegExp(`^(${TAG_KEY_PATTERN})=(.{1,${TAG_VALUE_MAX_LENGTH}})$`);

export function validateDeployArgs(argv: any, handelFile: HandelFile): string[] {
    let errors: string[] = [];

    // Require account config
    if (!argv.c) {
        errors.push('The \'-c\' parameter is required');
    }
    else { // Validate that it is either base64 decodable JSON or an account config file
        errors = errors.concat(validateAccountConfigParam(argv.c));
    }

    // Require environments to deploy
    if (!argv.e) {
        errors.push('The \'-e\' parameter is required');
    }
    else { // Validate that the environments exist in the Handel file
        errors = errors.concat(validateEnvsInHandelFile(argv.e, handelFile));
    }

    if (argv.t) {
        const tagErrors = argv.t.split(',')
            .filter((pair: string) => !pair.match(TAG_PARAM_PATTERN))
            .map((pair: string) => `The value for -t is invalid: '${pair}'`);
        errors = errors.concat(tagErrors);
    }

    return errors;
}

export function validateDeleteArgs(argv: any, handelFile: HandelFile): string[] {
    let errors: string[] = [];

    // Require account config
    if (!argv.c) {
        errors.push('The \'-c\' parameter is required');
    }
    else { // Validate that it is either base64 decodable JSON or an account config file
        errors = errors.concat(validateAccountConfigParam(argv.c));
    }

    // Require environments to deploy
    if (!argv.e) {
        errors.push('The \'-e\' parameter is required');
    }
    else { // Validate that the environments exist in the Handel file
        errors = errors.concat(validateEnvsInHandelFile(argv.e, handelFile));
    }

    return errors;
}

/**
 * This method is the top-level entry point for the 'deploy' action available in the
 * Handel CLI. It goes and deploys the requested environment(s) to AWS.
 */
export async function deployAction(handelFile: HandelFile, argv: any): Promise<void> {
    configureLogger(argv);

    const environmentsToDeploy = argv.e.split(',');
    try {
        await validateLoggedIn();
        const accountConfig = await config(argv.c); // Load account config to be consumed by the library
        await validateCredentials(accountConfig);
        // Set up AWS SDK with any global options
        util.configureAwsSdk(accountConfig);

        // Load all the currently implemented service deployers from the 'services' directory
        const serviceDeployers = util.getServiceDeployers();

        // Parse command-line tags
        const tags = parseTagsArg(argv.t);

        // Load Handel file from path and validate it
        winston.debug('Validating and parsing Handel file');
        const handelFileParser = util.getHandelFileParser(handelFile);
        validateHandelFile(handelFileParser, handelFile, serviceDeployers);

        // Command-line tags override handelfile tags.
        handelFile.tags = Object.assign({}, handelFile.tags, tags);

        const envDeployResults = await deployLifecycle.deploy(accountConfig, handelFile, environmentsToDeploy, handelFileParser, serviceDeployers);
        logFinalResult('deploy', envDeployResults);
    }
    catch (err) {
        logCaughtError('Unexpected error occurred during deploy', err);
        process.exit(1);
    }
}

/**
 * This method is the top-level entry point for the 'check' action available in the
 * Handel CLI. It goes and validates the Handel file so you can see if the file looks
 * correct
 */
export function checkAction(handelFile: HandelFile, argv: any): void {
    configureLogger(argv); // Don't enable debug on check?

    // Load all the currently implemented service deployers from the 'services' directory
    const serviceDeployers = util.getServiceDeployers();

    // Load Handel file from path and validate it
    winston.debug('Validating and parsing Handel file');
    const handelFileParser = util.getHandelFileParser(handelFile);
    validateHandelFile(handelFileParser, handelFile, serviceDeployers);

    const errors = checkLifecycle.check(handelFile, handelFileParser, serviceDeployers);
    let foundErrors = false;
    for (const env in errors) {
        if (errors.hasOwnProperty(env)) {
            const envErrors = errors[env];
            if (envErrors.length > 0) {
                winston.error(`The following errors were found for env ${env}:`);
                // tslint:disable-next-line:no-console
                console.log('  ' + envErrors.join('\n  '));
                foundErrors = true;
            }
        }
    }

    if (!foundErrors) {
        winston.info('No errors were found when checking Handel file');
    }
}

/**
 * This method is the top-level entry point for the 'delete' action available in the
 * Handel CLI. It asks for a confirmation, then deletes the requested environment.
 */
export async function deleteAction(handelFile: HandelFile, argv: any): Promise<void> {
    configureLogger(argv);

    const environmentToDelete = argv.e;
    try {
        await validateLoggedIn();
        const accountConfig = await config(argv.c); // Load account config to be consumed by the library
        await validateCredentials(accountConfig);
        const deleteEnvConfirmed = await confirmDelete(environmentToDelete, argv.y);
        if (deleteEnvConfirmed) {
            // Set up AWS SDK with any global options
            util.configureAwsSdk(accountConfig);

            // Load all the currently implemented service deployers from the 'services' directory
            const serviceDeployers = util.getServiceDeployers();

            // Load Handel file from path and validate it
            winston.debug('Validating and parsing Handel file');
            const handelFileParser = util.getHandelFileParser(handelFile);
            validateHandelFile(handelFileParser, handelFile, serviceDeployers);

            const envDeleteResult = await deleteLifecycle.deleteEnv(accountConfig, handelFile, environmentToDelete, handelFileParser, serviceDeployers);
            logFinalResult('delete', [envDeleteResult]);
        }
        else {
            winston.info('You did not type \'yes\' to confirm deletion. Will not delete environment.');
        }
    }
    catch (err) {
        logCaughtError('Unexpected error occurred during delete', err);
        process.exit(1);
    }

}
