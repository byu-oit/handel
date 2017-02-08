const util = require('./util/util');
const deployOrderCalc = require('./deploy/deploy-order-calc');
const winston = require('winston');
const fs = require('fs');
const _ = require('lodash');

/**
 * Gets the general account-level information from the provided file
 */
function getAccountConfig(accountConfigFilePath) {
    return util.readYamlFileSync(accountConfigFilePath);
}

/**
 * Gets the App Context from the deploy spec file
 */
function parseEnvironmentContext(deploySpecFilePath, environmentName) {
    let deploySpecYaml = util.readYamlFileSync(deploySpecFilePath);
    let deploySpecVersion = deploySpecYaml.version;
    let deploySpecParserFilename = `./deployspec/parserV${deploySpecVersion}.js`;
    let deploySpecParser;
    try {
        deploySpecParser = require(deploySpecParserFilename);
    }
    catch(versionError) {
        winston.error(`Invalid deploy spec version: ${deploySpecYaml.version}`);
        return null;
    }

    try {
        deploySpec = deploySpecParser.parseDeploySpec(deploySpecYaml);
        return deploySpecParser.getEnvironmentContext(deploySpec, environmentName);
    }
    catch(deploySpecError) {
        winston.error(`Error while parsing deploy spec: ${deploySpecError.message}`)
    }
}

function checkServices(environmentContext) {
    //Run check on all services in environment to make sure params are valid
    let errors = [];
    _.forEach(environmentContext.serviceContexts, function(serviceContext) {
        let checkErrors = serviceContext.deployer.check(serviceContext.params);
        errors = errors.concat(checkErrors);
    });
    if(errors.length > 0) {
        winston.error(`Errors while checking deploy spec: \n${errors.join("\n")}`);
        process.exit(1);
    }
}


function deployServicesInLevel(environmentContext, deployOrder, level) {
    //Call integrate on all services in parallel (produces a ServiceContextIntegrate)
    //Integrate does stuff like create roles, put credentials in S3 buckets (and create the roles to access them), and pass through env variables
        //RDS ought to give smaller credentials in the S3 bucket and put the master credentials somewhere else only accessible by account admins
    //Deploy all services in that level in parallel (they return their env, policies, and credentials in a ServiceContextDeploy)

    let serviceDeployPromises = [];

    var currentLevelElements = deployOrder[level];
    console.log("Deploying services: " + currentLevelElements.join(', '));
    for(let i = 0; i < currentLevelElements.length; i++) {
        let serviceToDeploy = environmentContext.serviceContexts[currentLevelElements[i]];
        serviceDeployPromises.push(serviceToDeploy.deployer.deploy(serviceToDeploy));
    }

    return Promise.all(serviceDeployPromises)
}

function deployServices(environmentContext, deployOrder) {
    let currentLevel = 0;
    let deployProcess = Promise.resolve();
    for(let currentLevel = 0; deployOrder[currentLevel]; currentLevel++) {
        deployProcess = deployProcess
            .then(value => deployServicesInLevel(environmentContext, deployOrder, currentLevel))
    };

    deployProcess
        .then(values => {
            console.log("Finished deploying everything");
        })
        .catch(reason => {
            console.log(`Deploy failed: ${reason}`)
        });
}


/**
 * Performs the actual deploy
 */
function doDeploy(accountConfig, environmentContext) {
    winston.info("Deploying!");

    checkServices(environmentContext);

    //Calculate dependency graph, which produces an ordered list of levels that can be deployed in parallel
    let deployOrder = deployOrderCalc.getDeployOrder(environmentContext);

    //Deploy services
    deployServices(environmentContext, deployOrder);
}

exports.deploy = function(accountConfigFileName, deploySpecFileName, environmentToDeploy) {
    let accountConfig = getAccountConfig(accountConfigFileName);
    let environmentContext = parseEnvironmentContext(deploySpecFileName, environmentToDeploy);
    if(!accountConfig || !environmentContext) {
        winston.error("Invalid config, terminating program");
        process.exit(1);
    }

    doDeploy(accountConfig, environmentContext);
}