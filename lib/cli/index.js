/*
 * Copyright 2017 Brigham Young University
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
const deleteLifecycle = require('../lifecycles/delete');
const deployLifecycle = require('../lifecycles/deploy');
const checkLifecycle = require('../lifecycles/check');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const winston = require('winston');
const util = require('../common/util');
const inquirer = require('inquirer');

function getAbsoluteConfigFilePath(filePath) {
    var absolutePath;
    if (fs.existsSync(filePath)) {
        absolutePath = path.resolve(filePath);
    }
    if (!absolutePath) {
        winston.error(`Invalid file path for config file: ${filePath}`);
        process.exit(1);
    }
    return absolutePath;
}

function configureLogger(argv) {
    let level = "info";
    if (argv.d) {
        level = 'debug';
    }
    winston.level = level;
    winston.cli();
}

function logCaughtError(msg, err) {
    winston.error(`${msg}: ${err.message}`);
    if (winston.level === 'debug') {
        winston.error(err);
    }
}

function logFinalResult(lifecycleName, envResults) {
    let success = true;
    for (let envResult of envResults) {
        if (envResult.status !== 'success') {
            winston.error(`Error during environment ${lifecycleName}: ${envResult.message}`);
            if (winston.level === 'debug') {
                winston.error(envResult.error);
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

function validateCredentials(accountConfig) {
    let deployAccount = accountConfig.account_id;
    winston.debug(`Checking that current credentials match account ${deployAccount}`);
    const IAM = require('../aws/iam-calls');
    return IAM.showAccount().then(discoveredId => {
        winston.debug(`Currently logged in under account ${discoveredId}`);
        if (deployAccount === discoveredId) { 
            return;
        }
        else {
            winston.error(`You are trying to deploy to the account ${deployAccount}, but you are logged into the account ${discoveredId}`);
            process.exit(1);
        }        
    });
}

function getAccountConfigFilePath(configFilePath) {
    if (!configFilePath) {
        winston.error("Missing account-config-file parameter");
        process.exit(1);
    }
    return getAbsoluteConfigFilePath(configFilePath);
}

function loadAccountConfig(accountConfigParam) {
    if (fs.existsSync(accountConfigParam)) {
        let absoluteConfigFilePath = getAccountConfigFilePath(accountConfigParam);
        return util.readYamlFileSync(absoluteConfigFilePath);
    }
    else {
        return yaml.safeLoad(new Buffer(accountConfigParam, 'base64').toString());
    }
}


function validateAccountConfigParam(accountConfigParam) {
    let errors = [];
    if (!fs.existsSync(accountConfigParam)) { //If not a path, check whether it's base64 encoded json
        try {
            yaml.safeLoad(new Buffer(accountConfigParam, 'base64').toString());
        }
        catch (e) {
            errors.push('Account config must be either a valid path to a file, or a base64 encoded JSON string');
        }
    }
    return errors;
}

function validateEnvsInHandelFile(envsToDeploy, handelFile) {
    let errors = [];
    let envsArray = envsToDeploy.split(',');
    for (let env of envsArray) {
        if (!handelFile.environments || !handelFile.environments[env]) {
            errors.push(`Environment '${env}' was not found in your Handel file`);
        }
    }
    return errors;
}

function confirmDelete(envName, confirmDelete) {
    if (confirmDelete) {
        return Promise.resolve(true);
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
        console.log(warnMsg);

        let questions = [
            {
                type: 'input',
                name: 'confirmDelete',
                message: `Enter 'yes' to delete your environment. Handel will refuse to delete the environment with any other answer:`
            }
        ]
        return inquirer.prompt(questions)
            .then(answers => {
                if (answers.confirmDelete === 'yes') {
                    return true;
                }
                else {
                    return false;
                }
            });
    }
}

exports.validateDeployArgs = function (argv, handelFile) {
    let errors = [];

    //Require account config
    if (!argv.c) {
        errors.push("The '-c' parameter is required");
    }
    else { //Validate that it is either base64 decodable JSON or an account config file
        errors = errors.concat(validateAccountConfigParam(argv.c));
    }

    //Require environments to deploy
    if (!argv.e) {
        errors.push("The '-e' parameter is required");
    }
    else { //Validate that the environments exist in the Handel file
        errors = errors.concat(validateEnvsInHandelFile(argv.e, handelFile));
    }

    //Require version
    if (!argv.v) {
        errors.push("The '-v' parameter is required");
    }

    return errors;
}

exports.validateDeleteArgs = function (argv, handelFile) {
    let errors = [];

    //Require account config
    if (!argv.c) {
        errors.push("The '-c' parameter is required");
    }
    else { //Validate that it is either base64 decodable JSON or an account config file
        errors = errors.concat(validateAccountConfigParam(argv.c));
    }

    //Require environments to deploy
    if (!argv.e) {
        errors.push("The '-e' parameter is required");
    }
    else { //Validate that the environments exist in the Handel file
        errors = errors.concat(validateEnvsInHandelFile(argv.e, handelFile));
    }

    return errors;
}

/**
 * This method is the top-level entry point for the 'deploy' action available in the
 * Handel CLI. It goes and deploys the requested environment(s) to AWS.
 */
exports.deployAction = function (handelFile, argv) {
    configureLogger(argv);
    let accountConfig = loadAccountConfig(argv.c);
    let deployVersion = argv.v;
    let environmentsToDeploy = argv.e.split(',');
    validateCredentials(accountConfig)
        .then(() => {
            return deployLifecycle.deploy(accountConfig, handelFile, environmentsToDeploy, deployVersion)
        })
        .then(envDeployResults => {
            logFinalResult('deploy', envDeployResults);
        })
        .catch(err => {
            logCaughtError("Unexpected error occurred during deploy", err);
            process.exit(1);
        });
}

/**
 * This method is the top-level entry point for the 'check' action available in the
 * Handel CLI. It goes and validates the Handel file so you can see if the file looks
 * correct
 */
exports.checkAction = function (handelFile, argv) {
    configureLogger(argv); //Don't enable debug on check?
    let errors = checkLifecycle.check(handelFile);
    let foundErrors = false;
    for (let env in errors) {
        let envErrors = errors[env];
        if (envErrors.length > 0) {
            winston.error(`The following errors were found for env ${env}`);
            console.log("  " + envErrors.join("\n  "));
            foundErrors = true;
        }
    }

    if (!foundErrors) {
        winston.info("No errors were found when checking Handel file");
    }
}

/**
 * This method is the top-level entry point for the 'delete' action available in the 
 * Handel CLI. It asks for a confirmation, then deletes the requested environment.
 */
exports.deleteAction = function (handelFile, argv) {
    configureLogger(argv);
    let accountConfig = loadAccountConfig(argv.c);
    let environmentToDelete = argv.e;
    validateCredentials(accountConfig)
        .then(() => {
            return confirmDelete(environmentToDelete, argv.d);
        })
        .then(confirmDelete => {
            if (confirmDelete) {
                deleteLifecycle.delete(accountConfig, handelFile, environmentToDelete)
                    .then(envDeleteResult => {
                        logFinalResult('delete', [envDeleteResult]);
                    })
                    .catch(err => {
                        logCaughtError("Unexpected error occurred during delete", err);
                        process.exit(1);
                    })
            }
            else {
                winston.info("You did not type 'yes' to confirm deletion. Will not delete environment.");
            }
        });
}
