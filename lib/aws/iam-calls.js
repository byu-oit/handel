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
    winston.debug(`Creating role ${roleName}`);
    return iam.createRole(createParams).promise()
        .then(createResponse => {
            winston.debug(`Created role ${roleName}`);
            return createResponse.Role;
        });
}

exports.getRole = function(roleName) {
    const iam = new AWS.IAM({apiVersion: '2010-05-08'});
    var getParams = {
        RoleName: roleName
    };
    winston.debug(`Attempting to find role ${roleName}`);
    return iam.getRole(getParams).promise()
        .then(role => {
            winston.debug(`Found role ${roleName}`);
            return role.Role;
        })
        .catch(err => {
            if(err.code === 'NoSuchEntity') {
                winston.debug(`Role ${roleName} does not exist`);
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
    winston.debug(`Attempting to find policy ${policyArn}`);
    return iam.getPolicy(params).promise()
        .then(policy => {
            winston.debug(`Found policy ${policyArn}`);
            return policy.Policy;
        })
        .catch(err => {
            if(err.code === 'NoSuchEntity') {
                winston.debug(`Policy ${policyArn} does not exist`);
                return null;
            }
            throw err;
        });
}

exports.createPolicy = function(policyName, policyDocument) {
    const iam = new AWS.IAM({apiVersion: '2010-05-08'});
    var createParams = {
        PolicyDocument: JSON.stringify(policyDocument),
        PolicyName: policyName,
        Description: `Auto-generated policy for the service ${policyName}`,
        Path: '/services/'
    };
    winston.debug(`Creating policy ${policyName}`);
    return iam.createPolicy(createParams).promise()
        .then(createResponse => {
            winston.debug(`Created new policy ${policyName}`)
            return createResponse.Policy;
        });
}

exports.createPolicyVersion = function(policyArn, policyDocument) {
    const iam = new AWS.IAM({apiVersion: '2010-05-08'});
    winston.debug(`Creating new policy version for ${policyArn}`)
    var createVersionParams = {
        PolicyArn: policyArn,
        PolicyDocument: JSON.stringify(policyDocument), 
        SetAsDefault: true
    };
    return iam.createPolicyVersion(createVersionParams).promise()
        .then(createVersionResponse => {
            winston.debug(`Created new policy version for ${policyArn}`)
            return createVersionResponse.PolicyVersion;
        });
}

exports.deleteAllPolicyVersionsButProvided = function(policyArn, policyVersionToKeep) {
    const iam = new AWS.IAM({apiVersion: '2010-05-08'});
    winston.debug(`Deleting all old policy versions for ${policyArn} but ${policyVersionToKeep.VersionId}`);
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
            winston.debug(`Deleted all old policy versions for ${policyArn} but ${policyVersionToKeep.VersionId}`)
            return policyVersionToKeep; //Return kept version
        });
}

exports.attachPolicyToRole = function(policyArn, roleName) {
    const iam = new AWS.IAM({apiVersion: '2010-05-08'});
    winston.debug(`Attaching policy ${policyArn} to role ${roleName}`)
    var params = {
        PolicyArn: policyArn,
        RoleName: roleName
    };
    return iam.attachRolePolicy(params).promise()
        .then(attachResponse => {
            winston.debug(`Attached policy ${policyArn} to role ${roleName}`)
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

exports.createPolicyIfNotExists = function(policyName, policyArn, policyDocument) {
    return exports.getPolicy(policyArn)
        .then(policy => {
            if(!policy) { //Create
                return exports.createPolicy(policyName, policyDocument);
            }
            return policy;
        });
}

exports.constructPolicyDoc = function(policyStatements) {
    let policyDocument = {
        Version: "2012-10-17",
        Statement: []
    };
    for(let policyStatement of policyStatements) {
        policyDocument.Statement.push(policyStatement);
    }
    return policyDocument;
}