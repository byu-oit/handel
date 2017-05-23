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
    if(statement.Principal.Service !== principal) {
        return false;
    }

    if(!statement.Condition || !statement.Condition.ArnLike || statement.Condition.ArnLike['AWS:SourceArn'] !== sourceArn) {
        return false;
    }
    return true;
}


exports.addLambdaPermission = function(functionName, principal, sourceArn) {
    let lambda = new AWS.Lambda({apiVersion: '2015-03-31'});
    var addPermissionParams = {
        Action: "lambda:InvokeFunction", 
        FunctionName: functionName, 
        Principal: principal, 
        SourceArn: sourceArn,
        StatementId: `${uuid()}`
    };
    winston.debug(`Adding Lambda permission to ${functionName}`);
    return lambda.addPermission(addPermissionParams).promise()
        .then(response => {
            winston.debug(`Added Lambda permission to ${functionName}`);
            return exports.getLambdaPermission(functionName, principal, sourceArn);
        });
}

exports.getLambdaPermission = function(functionName, principal, sourceArn) {
    let lambda = new AWS.Lambda({apiVersion: '2015-03-31'});
    var params = {
        FunctionName: functionName
    };
    winston.debug(`Attempting to find permission ${sourceArn} in function ${functionName}`);
    return lambda.getPolicy(params).promise()
        .then(getPolicyResponse => {
            let policy = JSON.parse(getPolicyResponse.Policy);
            for(let statement of policy.Statement) {
                if(statementIsSame(functionName, principal, sourceArn, statement)) {
                    winston.debug(`Found permission ${sourceArn} in function ${functionName}`);
                    return statement;
                }
            }
            winston.debug(`Permission ${sourceArn} in function ${functionName} does not exist`);
            return null;
        })
        .catch(err => {
            if(err.code === 'ResourceNotFoundException') {
                winston.debug(`Permission ${sourceArn} in function ${functionName} does not exist`);
                return null;
            }
            throw err; //Throw error on any other kind of error
        });
}

exports.addLambdaPermissionIfNotExists = function(functionName, principal, sourceArn) {
    return exports.getLambdaPermission(functionName, principal, sourceArn)
        .then(permission => {
            if(!permission) {
                return exports.addLambdaPermission(functionName, principal, sourceArn);
            }
            else {
                return permission;
            }
        });
}