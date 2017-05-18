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
            winston.debug(`Adding permission to SQS queue ${queueUrl} from ${sourceArn}`);
            return sqs.setQueueAttributes(setQueueAttributesParams).promise()
                .then(queueAttributesResponse => {
                    winston.debug(`Added permission to SQS queue ${queueUrl} from ${sourceArn}`);
                    return queueAttributesResponse;
                });
        });
}

exports.getSqsPermission = function (queueUrl, policyStatementToGet) {
    let sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
    winston.debug(`Attempting to find permission in policy doc for ${queueUrl}`);
    return getSqsQueuePolicyDoc(sqs, queueUrl)
        .then(policyDoc => {
            if (policyDoc) {
                let permissionFromPolicyDoc = getPermissionInPolicyDoc(policyDoc, policyStatementToGet);
                if (permissionFromPolicyDoc) {
                    winston.debug(`Found permission in policy doc for ${queueUrl}`);
                    return permissionFromPolicyDoc;
                }
                else {
                    winston.debug(`Permission does not exist in policy doc for ${queueUrl}`);
                    return null;
                }
            }
            else {
                winston.debug(`No policy defined for ${queueUrl}`);
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