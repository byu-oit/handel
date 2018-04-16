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
import { stripIndent } from 'common-tags';
import * as fs from 'fs';
import { AccountConfig, ServiceRegistry, Tags } from 'handel-extension-api';
import * as inquirer from 'inquirer';
import * as yaml from 'js-yaml';
import * as _ from 'lodash';
import * as winston from 'winston';
import config from '../account-config/account-config';
import * as stsCalls from '../aws/sts-calls';
import { TAG_KEY_PATTERN, TAG_KEY_REGEX, TAG_VALUE_MAX_LENGTH } from '../common/tagging-common';
import * as util from '../common/util';
import {
    CheckOptions,
    DeleteOptions,
    DeployOptions,
    EnvironmentResult, HandelCoreOptions,
    HandelFile,
    HandelFileParser,
} from '../datatypes';
import { resolveExtensions } from '../extensions-support/resolve-extensions';
import * as checkLifecycle from '../lifecycles/check';
import * as deleteLifecycle from '../lifecycles/delete';
import * as deployLifecycle from '../lifecycles/deploy';
import { initServiceRegistry } from '../service-registry';

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
    winston.debug('Checking that the user is logged in');
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
    if (!discoveredId) {
        winston.error(`You are not logged into an AWS account`);
        process.exit(1);
    }

    winston.debug(`Currently logged in under account ${discoveredId}`);
    // tslint:disable-next-line:triple-equals
    if (deployAccount == discoveredId) {
        return;
    }
    else {
        winston.error(`You are trying to deploy to the account ${deployAccount}, but you are logged into the account ${discoveredId}`);
        process.exit(1);
    }
}

async function validateHandelFile(handelFileParser: HandelFileParser, handelFile: HandelFile, serviceRegistry: ServiceRegistry): Promise<void> {
    const errors = await handelFileParser.validateHandelFile(handelFile, serviceRegistry);
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

function validateEnvsInHandelFile(envsToDeploy: string[], handelFile: HandelFile) {
    return envsToDeploy.filter(env => !handelFile.environments || !handelFile.environments[env])
        .map(env => `Environment '${env}' was not found in your Handel file`);
}

export function parseTagsArg(tagsArg: string | undefined): Tags {
    if (!tagsArg) {
        return {};
    }
    return tagsArg.split(',')
        .reduce((tags: Tags, pair: string) => {
            const matched = pair.match(TAG_PARAM_PATTERN);
            if (!matched) {
                throw new Error('Invalid tag value');
            }
            tags[matched[1]] = matched[2];
            return tags;
        }, {});
}

async function confirmDelete(envName: string, forceDelete: boolean): Promise<boolean> {
    if (forceDelete) {
        return true;
    } else {
        const warnMsg = stripIndent`
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

        const questions = [{
            type: 'input',
            name: 'confirmDelete',
            message: `Enter 'yes' to delete your environment. Handel will refuse to delete the environment with any other answer:`
        }];
        const answers = await inquirer.prompt(questions);
        return answers.confirmDelete === 'yes';
    }
}

const TAG_PARAM_PATTERN = RegExp(`^(${TAG_KEY_PATTERN})=(.{1,${TAG_VALUE_MAX_LENGTH}})$`);

export function validateDeployArgs(handelFile: HandelFile, opts: DeployOptions): string[] {
    const {accountConfig, environments, tags} = opts;
    let errors: string[] = [];

    // Validate that it is either base64 decodable JSON or an account config file
    errors = errors.concat(validateAccountConfigParam(accountConfig));

    // Validate that the environments exist in the Handel file
    errors = errors.concat(validateEnvsInHandelFile(environments, handelFile));

    if (tags) {
        for (const [tag, value] of _.entries(tags)) {
            if (!TAG_KEY_REGEX.test(tag)) {
                errors.push(`The tag name is invalid: '${tag}'`);
            }
            if (value.length === 0) {
                errors.push(`The value for tag '${tag}' must not be empty`);
            }
            if (value.length > TAG_VALUE_MAX_LENGTH) {
                errors.push(`The value for tag '${tag}' must be less than ${TAG_VALUE_MAX_LENGTH} in length.`);
            }
        }
    }

    return errors;
}

export function validateDeleteArgs(handelFile: HandelFile, opts: DeleteOptions): string[] {
    const {accountConfig, environment} = opts;
    let errors: string[] = [];

    // Validate that it is either base64 decodable JSON or an account config file
    errors = errors.concat(validateAccountConfigParam(accountConfig));

    // Validate that the environments exist in the Handel file
    errors = errors.concat(validateEnvsInHandelFile([environment], handelFile));

    return errors;
}

/**
 * This method is the top-level entry point for the 'deploy' action available in the
 * Handel CLI. It goes and deploys the requested environment(s) to AWS.
 */
export async function deployAction(handelFile: HandelFile, options: DeployOptions): Promise<void> {
    const environmentsToDeploy = options.environments;
    try {
        await validateLoggedIn();
        const accountConfig = await config(options.accountConfig); // Load account config to be consumed by the library
        await validateCredentials(accountConfig);
        // Set up AWS SDK with any global options
        util.configureAwsSdk(accountConfig);

        const {handelFileParser, serviceRegistry} = await init(handelFile, options);

        // Command-line tags override handelfile tags.
        handelFile.tags = Object.assign({}, handelFile.tags, options.tags);

        const envDeployResults = await deployLifecycle.deploy(accountConfig, handelFile, environmentsToDeploy, handelFileParser, serviceRegistry, options);
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
export async function checkAction(handelFile: HandelFile, options: CheckOptions): Promise<void> {
    const {handelFileParser, serviceRegistry} = await init(handelFile, options);

    const errors = checkLifecycle.check(handelFile, handelFileParser, serviceRegistry, options);
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
export async function deleteAction(handelFile: HandelFile, options: DeleteOptions): Promise<void> {
    try {
        await validateLoggedIn();
        const accountConfig = await config(options.accountConfig); // Load account config to be consumed by the library
        await validateCredentials(accountConfig);
        const environmentToDelete = options.environment;
        // Set up AWS SDK with any global options
        util.configureAwsSdk(accountConfig);

        const {handelFileParser, serviceRegistry} = await init(handelFile, options);

        const deleteEnvConfirmed = await confirmDelete(environmentToDelete, options.yes);
        if (deleteEnvConfirmed) {
            const envDeleteResult = await deleteLifecycle.deleteEnv(accountConfig, handelFile, environmentToDelete, handelFileParser, serviceRegistry, options);
            logFinalResult('delete', [envDeleteResult]);
        }
        else {
            winston.info('You did not type \'yes\' to confirm deletion. Will not delete environment.');
        }
    } catch (err) {
        logCaughtError('Unexpected error occurred during delete', err);
        process.exit(1);
    }

}

async function init(handelFile: HandelFile, options: HandelCoreOptions): Promise<HandelInit> {
    const handelFileParser: HandelFileParser = await util.getHandelFileParser(handelFile);

    const unresolvedExtensions = await handelFileParser.listExtensions(handelFile);

    winston.debug('Resolving Extensions');

    const extensions = await resolveExtensions(unresolvedExtensions, options);

    const serviceRegistry = await initServiceRegistry(extensions);

    winston.debug('Validating and parsing Handel file');
    await validateHandelFile(handelFileParser, handelFile, serviceRegistry);

    return {handelFileParser, serviceRegistry};
}

interface HandelInit {
    handelFileParser: HandelFileParser;
    serviceRegistry: ServiceRegistry;
}
