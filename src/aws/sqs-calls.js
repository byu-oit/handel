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

function getPermissionInPolicyDoc(policyDoc, policyStatement) {
    for (let statement of policyDoc.Statement) {
        let statementJson = JSON.stringify(statement);
        let policyStatementJson = JSON.stringify(policyStatement);
        if (statementJson === policyStatementJson) {
            return statement;
        }
    }
    return null;
}

function getSqsQueuePolicyDoc(sqs, queueUrl) {
    let getQueueAttributesParams = {
        AttributeNames: [
            "All"
        ],
        QueueUrl: queueUrl
    }

    return sqs.getQueueAttributes(getQueueAttributesParams).promise()
        .then(queueAttributesResponse => {
            console.log(queueAttributesResponse);
            let policy = queueAttributesResponse.Attributes.Policy;
            if (policy) {
                let policyDoc = JSON.parse(policy);
                return policyDoc;
            }
            else {
                return null; //No policy defined
            }
        });
}


exports.addSqsPermission = function (queueUrl, queueArn, sourceArn, policyStatement) {
    let sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

    return getSqsQueuePolicyDoc(sqs, queueUrl)
        .then(policyDoc => {
            if (policyDoc) { //Update existing policy
                policyDoc.Statement.push(policyStatement);
            }
            else { //Create new policy
                policyDoc = {
                    "Version": "2012-10-17",
                    "Statement": [policyStatement]
                }
            }

            var setQueueAttributesParams = {
                Attributes: {
                    Policy: JSON.stringify(policyDoc)
                },
                QueueUrl: queueUrl
            };
            winston.verbose(`Adding permission to SQS queue ${queueUrl} from ${sourceArn}`);
            return sqs.setQueueAttributes(setQueueAttributesParams).promise()
                .then(queueAttributesResponse => {
                    winston.verbose(`Added permission to SQS queue ${queueUrl} from ${sourceArn}`);
                    return queueAttributesResponse;
                });
        });
}

exports.getSqsPermission = function (queueUrl, policyStatementToGet) {
    let sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
    winston.verbose(`Attempting to find permission in policy doc for ${queueUrl}`);
    return getSqsQueuePolicyDoc(sqs, queueUrl)
        .then(policyDoc => {
            if (policyDoc) {
                let permissionFromPolicyDoc = getPermissionInPolicyDoc(policyDoc, policyStatementToGet);
                if (permissionFromPolicyDoc) {
                    winston.verbose(`Found permission in policy doc for ${queueUrl}`);
                    return permissionFromPolicyDoc;
                }
                else {
                    winston.verbose(`Permission does not exist in policy doc for ${queueUrl}`);
                    return null;
                }
            }
            else {
                winston.verbose(`No policy defined for ${queueUrl}`);
                return null;
            }
        });
}

exports.addSqsPermissionIfNotExists = function (queueUrl, queueArn, sourceArn, policyStatement) {
    return exports.getSqsPermission(queueUrl, policyStatement)
        .then(permission => {
            if (!permission) {
                return exports.addSqsPermission(queueUrl, queueArn, sourceArn, policyStatement)
                    .then(() => {
                        return exports.getSqsPermission(queueUrl, policyStatement);
                    });
            }
            else {
                return permission;
            }
        });
}