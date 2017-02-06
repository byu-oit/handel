const util = require('./util/util');
const winston = require('winston');
const fs = require('fs');
var _ = require('lodash');

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
    let deploySpecYaml = util.readYamlFileSync(deploySpecFilePath); //TODO - Need to do more here
    let deploySpecVersion = deploySpecYaml.version;
    let deploySpecParserFilename = `./deployspec/parserV${deploySpecVersion}.js`;
    let deploySpecParser;
    try {
        deploySpecParser = require(deploySpecParserFilename);
        deploySpec = deploySpecParser.parseDeploySpec(deploySpecYaml);
        environmentContext = deploySpecParser.getEnvironmentContext(deploySpec, environmentName);
        if(!environmentContext) {
            winston.error("Invalid environment specified");
        }
        return environmentContext;
    }
    catch(e) {
        winston.error(`Invalid deploy spec version: ${deploySpecYaml.version}`);
        return null;
    }
}

/**
 * Performs the actual deploy
 */
function doDeploy(accountConfig, environmentContext) {
    winston.info("Deploying!");

    _.forEach(environmentContext, function(systemContext, systemName) {
        //Run check on system config
        console.log(systemName);
        console.log(systemContext);
    });

    //Do deploy

    //Do bind

    winston.info("Finished deploying everything");
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