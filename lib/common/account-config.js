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
const fs = require('fs');
const util = require('./util');
const winston = require('winston');
const path = require('path');
const yaml = require('js-yaml');

function throwValidateError(field) {
    throw new Error(`'${field}' field missing in the account config file`);
}

function validateAccountConfig(configToValidate) {
    let requiredFields = [
        'account_id',
        'region',
        'vpc',
        'public_subnets',
        'private_subnets',
        'data_subnets'
    ]

    for (let requiredField of requiredFields) {
        if (!configToValidate[requiredField]) {
            throwValidateError(requiredField)
        }
    }
}

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

/**
 * Given an account config file path or base64 encoded string, loads the account config
 */
module.exports = function(accountConfigParam) {
    let accountConfig;
    if (fs.existsSync(accountConfigParam)) {
        let absoluteConfigFilePath = getAbsoluteConfigFilePath(accountConfigParam);
        accountConfig = util.readYamlFileSync(absoluteConfigFilePath);
    }
    else {
        accountConfig = yaml.safeLoad(new Buffer(accountConfigParam, 'base64').toString());
    }

    validateAccountConfig(accountConfig);

    return accountConfig;
}
