const util = require('./util/util');
const deployOrderCalc = require('./deploy/deploy-order-calc');
const winston = require('winston');
const AWS = require('aws-sdk');
const bindLifecycle = require('./lifecycle/bind');
const deployLifecycle = require('./lifecycle/deploy');
const preDeployLifecycle = require('./lifecycle/pre-deploy');
const checkLifecycle = require('./lifecycle/check');
const consumeEventsLifecycle = require('./lifecycle/consume-events');
const produceEventsLifecycle = require('./lifecycle/produce-events');
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
function createEnvironmentContext(handelFile, handelFileParser, environmentName, deployVersion) {
    try {
        return handelFileParser.createEnvironmentContext(handelFile, environmentName, deployVersion);
    }
    catch(err) {
        winston.error(`Error while parsing deploy spec: ${err.message}`);
        return null;
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
                return {
                    bindContexts: bindContexts,
                    deployContexts: deployContexts
                }
            });
    }

    return deployProcess;
}

function setupEventBindings(serviceDeployers, environmentContext, deployContexts) {
    winston.info("Setting up event bindings between services (if any)");
    return consumeEventsLifecycle.consumeEvents(serviceDeployers, environmentContext, deployContexts)
        .then(consumeEventsContexts => {
            return produceEventsLifecycle.produceEvents(serviceDeployers, environmentContext, deployContexts)
                .then(produceEventsContexts => {
                    return {
                        consumeEventsContexts: consumeEventsContexts,
                        produceEventsContexts: produceEventsContexts
                    };
                });
        });
}

/**
 * Performs the actual deploy
 * 
 * @returns Promise.<EnvironmentDeployResult>
 */
function deployEnvironment(accountConfig, serviceDeployers, environmentContext) {
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
                    return setupEventBindings(serviceDeployers, environmentContext, bindAndDeployResults.deployContexts);
                })
                .then(eventBindingResults => {
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

            //Load Handel file from path and validate it
            winston.info("Validating and parsing Handel file");
            let handelFile = util.readYamlFileSync(handelFilePath);
            let handelFileParser = util.getHandelFileParser(handelFile);
            handelFileParser.validateHandelFile(handelFile, serviceDeployers);

            //Run the deploy on each environment specified
            let envDeployPromises = [];
            for(let environmentToDeploy of environmentsToDeploy) {
                let environmentContext = createEnvironmentContext(handelFile, handelFileParser, environmentToDeploy, deployVersion);
                envDeployPromises.push(deployEnvironment(accountConfig, serviceDeployers, environmentContext));
            }

            Promise.all(envDeployPromises)
                .then(results => {
                    resolve(results)
                });
        }
        catch(err) {
            reject(err);
        }
    });
}