const fs = require('fs');
const util = require('./util');

let accountConfig = null;

function throwValidateError(field) {
    throw new Error(`'${field}' field missing in the account config file`);
}

function validateAccountConfig(configToValidate) {
    let requiredFields = [
        'region',
        'vpc',
        'public_subnets',
        'private_subnets',
        'data_subnets'
    ]

    for(let requiredField of requiredFields) {
        if(!configToValidate[requiredField]) {
            throwValidateError(requiredField)
        }
    }
}

/**
 * Given an account config file path, sets the account config from that YAML file
 * 
 * Once you've called this the first time, you do not need to provide the path again,
 * it will persist in this module for anyone else to use.
 */
module.exports = function(newAccountConfig) {
    if(!accountConfig) {
        if(newAccountConfig) {
            if (fs.existsSync(newAccountConfig)) {
                // Do something
                accountConfig = util.readYamlFileSync(newAccountConfig);
            }
            else { //Assume its hard-coded account config object
                accountConfig = newAccountConfig;
            }
            validateAccountConfig(accountConfig)
        }
        else {
            throw new Error("Missing account config file name");
        }
    }

    return {
        getAccountConfig: function() {
            return accountConfig;
        }
    }
}