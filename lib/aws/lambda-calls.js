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
const winston = require('winston');
const uuid = require('uuid');


function statementIsSame(functionName, principal, sourceArn, statement) {
    if (statement.Principal.Service !== principal) {
        return false;
    }

    if (!statement.Condition || !statement.Condition.ArnLike || statement.Condition.ArnLike['AWS:SourceArn'] !== sourceArn) {
        return false;
    }
    return true;
}


exports.addLambdaPermission = function (functionName, principal, sourceArn) {
    let lambda = new AWS.Lambda({ apiVersion: '2015-03-31' });

    var addPermissionParams = {
        Action: "lambda:InvokeFunction",
        FunctionName: functionName,
        Principal: principal,
        SourceArn: sourceArn,
        StatementId: `${uuid()}`
    };

    winston.verbose(`Adding Lambda permission to ${functionName}`);
    return lambda.addPermission(addPermissionParams).promise()
        .then(response => {
            winston.verbose(`Added Lambda permission to ${functionName}`);
            return exports.getLambdaPermission(functionName, principal, sourceArn);
        });
}

exports.getLambdaPermission = function (functionName, principal, sourceArn) {
    let lambda = new AWS.Lambda({ apiVersion: '2015-03-31' });

    var getParams = {
        FunctionName: functionName
    };

    winston.verbose(`Attempting to find permission ${sourceArn} in function ${functionName}`);
    return lambda.getPolicy(getParams).promise()
        .then(getPolicyResponse => {
            let policy = JSON.parse(getPolicyResponse.Policy);
            for (let statement of policy.Statement) {
                if (statementIsSame(functionName, principal, sourceArn, statement)) {
                    winston.verbose(`Found permission ${sourceArn} in function ${functionName}`);
                    return statement;
                }
            }
            winston.verbose(`Permission ${sourceArn} in function ${functionName} does not exist`);
            return null;
        })
        .catch(err => {
            if (err.code === 'ResourceNotFoundException') {
                winston.verbose(`Permission ${sourceArn} in function ${functionName} does not exist`);
                return null;
            }
            throw err; //Throw error on any other kind of error
        });
}

exports.addLambdaPermissionIfNotExists = function (functionName, principal, sourceArn) {
    return exports.getLambdaPermission(functionName, principal, sourceArn)
        .then(permission => {
            if (!permission) {
                return exports.addLambdaPermission(functionName, principal, sourceArn);
            }
            else {
                return permission;
            }
        });
}

exports.addLambdaEventSourceMapping = function (functionName, tableName, streamArn, batchSize) {
    let lambda = new AWS.Lambda({ apiVersion: '2015-03-31' });
    const deferred = {};
    deferred.promise = new Promise((resolve, reject) => {
        deferred.resolve = resolve;
        deferred.reject = reject;
    });

    function addLambdaEventSourceMapping() {
        var params = {
            EventSourceArn: streamArn,
            FunctionName: functionName,
            StartingPosition: "LATEST", // Other options (TRIM_HORIZON, AT_TIMESTAMP) are for Kinesis Streams Only
            BatchSize: batchSize,
            Enabled: true
        };
        winston.debug(`Adding Lambda Event Source Mapping to ${functionName} for ${tableName}`);

        return lambda.createEventSourceMapping(params).promise()
        .then(() => {
            winston.debug(`Added Lambda Event Source Mapping to ${functionName} for ${tableName}`);
            return;
        })
        .then(() => {
            deferred.resolve()
        })
        .catch((err) => {
            if(err.code === 'InvalidParameterValueException' && err.message.indexOf('Cannot access stream') !== -1) {
                setTimeout(function () {
                    addLambdaEventSourceMapping();
                }, 5000);
            } else if(err.code === 'ResourceConflictException' && err.message.indexOf('provided mapping already exists') !== -1) {
                winston.debug(`The Lambda Event Source Mapping for ${functionName} and ${tableName} already exists`);
                deferred.resolve()
            } else {
                winston.debug(`Failed to add Lambda Event Source Mapping to ${functionName} for ${tableName}`)
                deferred.reject(err);
            }
        })
    }
    addLambdaEventSourceMapping()

    return deferred.promise;
}
