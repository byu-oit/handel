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
const AWS = require('aws-sdk');

exports.storeParameter = function (paramName, paramType, paramValue) {
    const ssm = new AWS.SSM();
    var params = {
        Name: paramName,
        Type: paramType,
        Value: paramValue,
        Description: 'Handel-injected parameter',
        Overwrite: true
    };
    return ssm.putParameter(params).promise();
}

/**
 * Given a list of parameter names, deletes those parameters
 * 
 * @param {List.<String>} parameterNames - The list of parameter names to delete
 * @returns {Promise.<Boolean>} - A Promise that returns true when the params are deleted
 */
exports.deleteParameters = function (parameterNames) {
    const ssm = new AWS.SSM();
    let deletePromises = [];

    for (let parameterName of parameterNames) {
        let deleteParams = {
            Name: parameterName
        };
        deletePromises.push(ssm.deleteParameter(deleteParams).promise());
    }

    return Promise.all(deletePromises)
        .then(() => {
            return true;
        })
}