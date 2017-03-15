const AWS = require('aws-sdk');
const winston = require('winston');

exports.createRole = function(roleName, trustedService) {
    const iam = new AWS.IAM({apiVersion: '2010-05-08'});
    let assumeRolePolicyDoc = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "",
                "Effect": "Allow",
                "Principal": {
                    "Service": trustedService
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }
    var createParams = {
        AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDoc), 
        Path: "/services/", 
        RoleName: roleName
    };
    return iam.createRole(createParams).promise()
        .then(createResponse => {
            return createResponse.Role;
        });
}

exports.getRole = function(roleName) {
    const iam = new AWS.IAM({apiVersion: '2010-05-08'});
    var getParams = {
        RoleName: roleName
    };
    return iam.getRole(getParams).promise()
        .then(role => {
            return role.Role;
        })
        .catch(err => {
            if(err.code === 'NoSuchEntity') {
                return null
            }
            throw err;
        });
}

exports.createRoleIfNotExists = function(roleName, trustedService) {
    return exports.getRole(roleName)
        .then(role => {
            if(!role) {
                return exports.createRole(roleName, trustedService);
            }
            else {
                return role;
            }
        });
}

exports.getPolicy = function(policyArn) {
    const iam = new AWS.IAM({apiVersion: '2010-05-08'});
    var params = {
        PolicyArn: policyArn
    };
    return iam.getPolicy(params).promise()
        .then(policy => {
            return policy.Policy;
        })
        .catch(err => {
            if(err.code === 'NoSuchEntity') {
                return null;
            }
            throw err;
        });
}

exports.createPolicy = function(policyName, policyDocument) {
    const iam = new AWS.IAM({apiVersion: '2010-05-08'});
    winston.info(`Creating new policy ${policyName}`);
    var createParams = {
        PolicyDocument: JSON.stringify(policyDocument),
        PolicyName: policyName,
        Description: `Auto-generated policy for the service ${policyName}`,
        Path: '/services/'
    };
    return iam.createPolicy(createParams).promise()
        .then(createResponse => {
            winston.info(`Created new policy ${policyName}`)
            return createResponse.Policy;
        });
}

exports.createPolicyVersion = function(policyArn, policyDocument) {
    const iam = new AWS.IAM({apiVersion: '2010-05-08'});
    winston.info(`Creating new policy version for ${policyArn}`)
    var createVersionParams = {
        PolicyArn: policyArn,
        PolicyDocument: JSON.stringify(policyDocument), 
        SetAsDefault: true
    };
    return iam.createPolicyVersion(createVersionParams).promise()
        .then(createVersionResponse => {
            winston.info(`Created new policy version for ${policyArn}`)
            return createVersionResponse.PolicyVersion;
        });
}

exports.deleteAllPolicyVersionsButProvided = function(policyArn, policyVersionToKeep) {
    const iam = new AWS.IAM({apiVersion: '2010-05-08'});
    winston.info(`Deleting all old policy versions for ${policyArn} but ${policyVersionToKeep.VersionId}`);
    var listPolicyVersionsParams = {
        PolicyArn: policyArn
    };
    return iam.listPolicyVersions(listPolicyVersionsParams).promise()
        .then(policyVersionsResponse => {
            let deletePolicyPromises = [];
            for(let policyVersion of policyVersionsResponse.Versions) {
                if(policyVersion.VersionId !== policyVersionToKeep.VersionId) {
                    let deleteVersionParams = {
                        PolicyArn: policyArn, 
                        VersionId: policyVersion.VersionId
                    }
                    deletePolicyPromises.push(iam.deletePolicyVersion(deleteVersionParams).promise());
                }

            }
            return Promise.all(deletePolicyPromises);
        })
        .then(deleteResponses => {
            winston.info(`Deleted all old policy versions for ${policyArn} but ${policyVersionToKeep.VersionId}`)
            return policyVersionToKeep; //Return kept version
        });
}

exports.attachPolicyToRoleIfNeeded = function(policyArn, roleName) {
    const iam = new AWS.IAM({apiVersion: '2010-05-08'});
    winston.info(`Attaching policy ${policyArn} to role ${roleName}`)
    var params = {
        PolicyArn: policyArn,
        RoleName: roleName
    };
    return iam.attachRolePolicy(params).promise()
        .then(attachResponse => {
            winston.info(`Attached policy ${policyArn} to role ${roleName}`)
            return attachResponse;
        });
}

exports.createOrUpdatePolicy = function(policyName, policyArn, policyDocument) {
    return exports.getPolicy(policyArn)
        .then(policy => {
            if(!policy) { //Create
                return exports.createPolicy(policyName, policyDocument);
            }
            else { //Update
                return exports.createPolicyVersion(policyArn, policyDocument)
                    .then(policyVersion => {
                        return exports.deleteAllPolicyVersionsButProvided(policyArn, policyVersion);
                    })
                    .then(policyVersion => {
                        return exports.getPolicy(policyArn);
                    });
            }
        });

}

exports.getPolicyDocumentForMultiplePolicyStatements = function(policyStatements) {
    let policyDocument = {
        Version: "2012-10-17",
        Statement: []
    };
    for(let policyStatement of policyStatements) {
        policyDocument.Statement.push(policyStatement);
    }
    return policyDocument;
}