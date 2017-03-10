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

function configureAwsSdk(accountConfig) {
    AWS.config.update({region: accountConfig.region});
}

/**
 * Gets the App Context from the deploy spec file
 */
function parseEnvironmentContext(deploySpecFilePath, environmentName, deployVersion) {
    let deploySpec = util.readYamlFileSync(deploySpecFilePath);
    let deploySpecVersion = deploySpec.version;
    let deploySpecParserFilename = `./deployspec/parserV${deploySpecVersion}.js`;
    let deploySpecParser;
    try {
        deploySpecParser = require(deploySpecParserFilename);
    }
    catch(versionError) {
        winston.error(`Invalid deploy spec version: ${deploySpec.version}`);
        return null;
    }

    try {
        deploySpecParser.validateDeploySpec(deploySpec);
        return deploySpecParser.getEnvironmentContext(deploySpec, environmentName, deployVersion);
    }
    catch(deploySpecError) {
        winston.error(`Error while parsing deploy spec: ${deploySpecError.message}`)
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
            })
    }

    deployProcess
        .then(() => {
            winston.info("Finished deploying everything");
        })
        .catch(reason => {
            winston.error(reason);
            winston.error(`Deploy failed: ${reason}`);
        });
}

/**
 * Performs the actual deploy
 */
function doDeploy(serviceDeployers, environmentContext) {
    winston.info(`Starting deploy for environment ${environmentContext.environmentName}, version ${environmentContext.deployVersion}`);

    let errors = checkLifecycle.checkServices(serviceDeployers, environmentContext);
    if(errors.length === 0) {
        //Run pre-deploy (all services get run in parallel, regardless of level)
        preDeployLifecycle.preDeployServices(serviceDeployers, environmentContext)
            .then(preDeployResults => {
                //Deploy services (this will be done ordered levels at a time)
                let deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
                bindAndDeployServices(serviceDeployers, environmentContext, preDeployResults, deployOrder);
            });
    }
    else {
        winston.error(`Errors while checking deploy spec: \n${errors.join("\n")}`);
    }
}

exports.deploy = function(accountConfigFileName, deploySpecFileName, environmentToDeploy, deployVersion) {
    //Pull account-level config from the provided file so it can be consumed by the library
    let accountConfig = config(accountConfigFileName).getAccountConfig();

    //Set up AWS SDK with any global options
    configureAwsSdk(accountConfig);

    //Load all the currently implemented service deployers from the 'services' directory
    let serviceDeployers = util.getServiceDeployers();

    let environmentContext = parseEnvironmentContext(deploySpecFileName, environmentToDeploy, deployVersion);
    if(!accountConfig || !environmentContext) {
        winston.error("Invalid config, terminating program");
        process.exit(1);
    }
    doDeploy(serviceDeployers, environmentContext);
}