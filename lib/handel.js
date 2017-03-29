const util = require('./util/util');
const deployOrderCalc = require('./deploy/deploy-order-calc');
const winston = require('winston');
const _ = require('lodash');
const AWS = require('aws-sdk');
const bindLifecycle = require('./lifecycle/bind');
const deployLifecycle = require('./lifecycle/deploy');
const preDeployLifecycle = require('./lifecycle/pre-deploy');
const checkLifecycle = require('./lifecycle/check');
const config = require('./util/account-config');

class EnvironmentDeployResult {
    constructor(status, message, error) {
        this.status = status;
        this.message = message;
        this.error = error;
    }
}

function configureAwsSdk(accountConfig) {
    AWS.config.update({region: accountConfig.region});
}

/**
 * Gets the App Context from the deploy spec file
 */
function parseEnvironmentContext(handelFilePath, environmentName, deployVersion) {
    let handelFile = util.readYamlFileSync(handelFilePath);
    let handelFileVersion = handelFile.version;
    let handelFileParserFilename = `./handelfile/parser-v${handelFileVersion}.js`;
    let handelFileParser;
    try {
        handelFileParser = require(handelFileParserFilename);
    }
    catch(versionError) {
        winston.error(`Invalid deploy spec version: ${handelFile.version}`);
        return null;
    }

    try {
        handelFileParser.validateHandelFile(handelFile);
        return handelFileParser.getEnvironmentContext(handelFile, environmentName, deployVersion);
    }
    catch(err) {
        winston.error(`Error while parsing deploy spec: ${err.message}`)
    }
}

function bindAndDeployServices(serviceDeployers, environmentContext, preDeployContexts, deployOrder) {
    let deployProcess = Promise.resolve();
    let bindContexts = {}
    let deployContexts = {}
    for(let currentLevel = 0; deployOrder[currentLevel]; currentLevel++) {
        deployProcess = deployProcess
            .then(() => bindLifecycle.bindServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployOrder, currentLevel))
            .then(levelBindResults => {
                for(let serviceName in levelBindResults) {
                    bindContexts[serviceName] = levelBindResults[serviceName]
                }
            })
            .then(() => deployLifecycle.deployServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployContexts, deployOrder, currentLevel)) //TODO - MAKE SURE WE ARE RETURNING THE CORRECT THING HERE
            .then(levelDeployResults => {
                for(let serviceName in levelDeployResults) {
                    deployContexts[serviceName] = levelDeployResults[serviceName]
                }
            });
    }

    return deployProcess;
}

/**
 * Performs the actual deploy
 * 
 * @returns Promise.<EnvironmentDeployResult>
 */
function deployEnvironment(accountConfig, serviceDeployers, handelFileFileName, environmentToDeploy, deployVersion) {
    let environmentContext = parseEnvironmentContext(handelFileFileName, environmentToDeploy, deployVersion);
    if(!accountConfig || !environmentContext) {
        return Promise.resolve(new EnvironmentDeployResult("failure", "Invalid configuration"));
    }
    else {
        winston.info(`Starting deploy for environment ${environmentContext.environmentName}, version ${environmentContext.deployVersion}`);

        let errors = checkLifecycle.checkServices(serviceDeployers, environmentContext);
        if(errors.length === 0) {
            //Run pre-deploy (all services get run in parallel, regardless of level)
            return preDeployLifecycle.preDeployServices(serviceDeployers, environmentContext)
                .then(preDeployResults => {
                    //Deploy services (this will be done ordered levels at a time)
                    let deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
                    return bindAndDeployServices(serviceDeployers, environmentContext, preDeployResults, deployOrder)
                })
                .then(bindAndDeployResults => {
                    return new EnvironmentDeployResult("success");
                })
                .catch(err => {
                    return new EnvironmentDeployResult("failure", err.message, err);
                });
        }
        else {
            return Promise.resolve(new EnvironmentDeployResult("failure", `Errors while checking deploy spec: \n${errors.join("\n")}`));
        }
    }
}

exports.deploy = function(newAccountConfig, handelFilePath, environmentsToDeploy, deployVersion) {
    return new Promise((resolve, reject) => {
        try {
            //Pull account-level config from the provided file so it can be consumed by the library
            let accountConfig = config(newAccountConfig).getAccountConfig();

            //Set up AWS SDK with any global options
            configureAwsSdk(accountConfig);

            //Load all the currently implemented service deployers from the 'services' directory
            let serviceDeployers = util.getServiceDeployers();

            let envDeployPromises = [];

            for(let environmentToDeploy of environmentsToDeploy) {
                envDeployPromises.push(deployEnvironment(accountConfig, serviceDeployers, handelFilePath, environmentToDeploy, deployVersion));
            }

            Promise.all(envDeployPromises)
                .then(results => {
                    resolve(results)
                });
        }
        catch(err) {
            winston.warn(err);
            reject(err);
        }
    });
}