const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const winston = require('winston');
const util = require('../util/util');

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

exports.validateAccountConfigParam = function(accountConfigParam) {
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

exports.validateEnvsInHandelFile = function(envsToDeploy, handelFile) {
    let errors = [];
    let envsArray = envsToDeploy.split(',');
    for(let env of envsArray) {
        if(!handelFile.environments || !handelFile.environments[env]) {
            errors.push(`Environment '${env}' was not found in your Handel file`);
        }
    }
    return errors;
}

exports.validateDeployArgs = function(argv, handelFile) {
    let errors = [];

    //Require account config
    if (!argv.c) {
        errors.push("The '-c' parameter is required");
    }
    else { //Validate that it is either base64 decodable JSON or an account config file
        errors = errors.concat(exports.validateAccountConfigParam(argv.c));
    }

    //Require environments to deploy
    if (!argv.e) {
        errors.push("The '-e' parameter is required");
    }
    else { //Validate that the environments exist in the Handel file
        errors = errors.concat(exports.validateEnvsInHandelFile(argv.e, handelFile));
    }

    //Require version
    if (!argv.v) {
        errors.push("The '-v' parameter is required");
    }
    
    return errors;
}

exports.validateDeleteArgs = function() {
    throw new Error("DEPLOY ACTION IS NOT IMPLEMENTED YET!");
}

exports.getAccountConfigFilePath = function(configFilePath) {
    if (!configFilePath) {
        winston.error("Missing account-config-file parameter");
        process.exit(1);
    }
    return getAbsoluteConfigFilePath(configFilePath);
}

exports.loadAccountConfig = function(accountConfigParam) {
    if(fs.existsSync(accountConfigParam)) {
        let absoluteConfigFilePath = exports.getAccountConfigFilePath(accountConfigParam);
        return util.readYamlFileSync(absoluteConfigFilePath);
    }
    else {
        return yaml.safeLoad(new Buffer(accountConfigParam, 'base64').toString());
    }
}

