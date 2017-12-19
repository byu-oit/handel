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

function getSnsPolicyDoc(sns, topicArn) {
    let getTopicAttributesParams = {
        TopicArn: topicArn
    }

    return sns.getTopicAttributes(getTopicAttributesParams).promise()
        .then(topicAttributesResponse => {
            console.log(topicAttributesResponse);
            let policy = topicAttributesResponse.Attributes.Policy;
            if (policy) {
                let policyDoc = JSON.parse(policy);
                return policyDoc;
            }
            else {
                return null; //No policy defined
            }
        });
}

exports.addSnsPermission = function (topicArn, sourceArn, policyStatement) {
    let sns = new AWS.SNS({ apiVersion: '2010-03-31' });

    return getSnsPolicyDoc(sns, topicArn)
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

            var setTopicAttributesParams = {
                AttributeName: 'Policy',
                TopicArn: topicArn,
                AttributeValue: JSON.stringify(policyDoc)
            };
            winston.verbose(`Adding permission to SNS topic ${topicArn} from ${sourceArn}`);
            return sns.setTopicAttributes(setTopicAttributesParams).promise()
                .then(topicAttributesResponse => {
                    winston.verbose(`Added permission to SNS Topic ${topicArn} from ${sourceArn}`);
                    return topicAttributesResponse;
                });
        });
}

exports.getSnsPermission = function (topicArn, policyStatementToGet) {
    let sns = new AWS.SNS({ apiVersion: '2010-03-31' });
    winston.verbose(`Attempting to find permission in policy doc for ${topicArn}`);
    return getSnsPolicyDoc(sns, topicArn)
        .then(policyDoc => {
            if (policyDoc) {
                let permissionFromPolicyDoc = getPermissionInPolicyDoc(policyDoc, policyStatementToGet);
                if (permissionFromPolicyDoc) {
                    winston.verbose(`Found permission in policy doc for ${topicArn}`);
                    return permissionFromPolicyDoc;
                }
                else {
                    winston.verbose(`Permission does not exist in policy doc for ${topicArn}`);
                    return null;
                }
            }
            else {
                winston.verbose(`No policy defined for ${topicArn}`);
                return null;
            }
        });
}

exports.addSnsPermissionIfNotExists = function (topicArn, sourceArn, policyStatement) {
    return exports.getSnsPermission(topicArn, policyStatement)
        .then(permission => {
            if (!permission) {
                return exports.addSnsPermission(topicArn, sourceArn, policyStatement)
                    .then(() => {
                        return exports.getSnsPermission(topicArn, policyStatement);
                    });
            }
            else {
                return permission;
            }
        });
}

exports.subscribeToTopic = function (topicArn, protocol, endpoint) {
    let sns = new AWS.SNS({ apiVersion: '2010-03-31' });
    let subscribeParams = {
        Protocol: protocol,
        TopicArn: topicArn,
        Endpoint: endpoint
    };
    winston.verbose(`Subscribing ${endpoint} to SNS topic ${topicArn}`);
    return sns.subscribe(subscribeParams).promise()
        .then(subscribeResponse => {
            winston.verbose(`Subscribed ${endpoint} to SNS topic ${topicArn}`);
            return subscribeResponse.SubscriptionArn;
        });
}