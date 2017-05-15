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
            .then(() => deployLifecycle.deployServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployContexts, deployOrder, currentLevel))
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

exports.check = function(handelFile, environmentsToDeploy, deployVersion) {
    //Use fake account config
    config({
        account_id: 111111111111,
        region: 'us-west-2',
        vpc: 'vpc-aaaaaaaa',
        public_subnets: [
            'subnet-ffffffff',
            'subnet-44444444'
        ],
        private_subnets: [
            'subnet-00000000',
            'subnet-77777777'
        ],
        data_subnets: [
            'subnet-eeeeeeee',
            'subnet-99999999'
        ],
        ecs_ami: 'ami-66666666',
        ssh_bastion_sg: 'sg-44444444',
        on_prem_cidr: '10.10.10.10/0'
    }).getAccountConfig();

    //Load all the currently implemented service deployers from the 'services' directory
    let serviceDeployers = util.getServiceDeployers();

    //Load Handel file from path and validate it
    winston.info("Validating and parsing Handel file");
    let handelFileParser = util.getHandelFileParser(handelFile);
    handelFileParser.validateHandelFile(handelFile, serviceDeployers);

    let foundErrors = false;
    for(let environmentToCheck in handelFile.environments) {
        let environmentContext = createEnvironmentContext(handelFile, handelFileParser, environmentToCheck, "1"); //Use fake version of deploy_version
        let errors = checkLifecycle.checkServices(serviceDeployers, environmentContext);
        if(errors.length > 0) {
            winston.error(`The following errors were found for env ${environmentToCheck}`);
            console.log("  " + errors.join("\n  "));
            foundErrors = true;
        }
    }
    if(!foundErrors) {
        winston.info("No errors were found when checking Handel file");
    }
}

exports.delete = function() {

}

exports.deploy = function(newAccountConfig, handelFile, environmentsToDeploy, deployVersion) {
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