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

/**
 * Given a role name, creates the role with the given trusted service.
 *
 * The created role is only assumable by the provided trusted service. For example,
 * if you provide 'ec2.amazonaws.com' as the trusted service, only EC2 instances
 * will be able to assume that role.
 */
exports.createRole = function (roleName, trustedService) {
    const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
    let assumeRolePolicyDoc = {
        "Version": "2012-10-17",
        "Statement": [
            {
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
    winston.verbose(`Creating role ${roleName}`);
    return iam.createRole(createParams).promise()
        .then(createResponse => {
            winston.verbose(`Created role ${roleName}`);
            return createResponse.Role;
        });
}

/**
 * Given a role name, returns information about that role, or null if
 * the role doesn't exist
 */
exports.getRole = function (roleName) {
    const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
    var getParams = {
        RoleName: roleName
    };
    winston.verbose(`Attempting to find role ${roleName}`);
    return iam.getRole(getParams).promise()
        .then(role => {
            winston.verbose(`Found role ${roleName}`);
            return role.Role;
        })
        .catch(err => {
            if (err.code === 'NoSuchEntity') {
                winston.verbose(`Role ${roleName} does not exist`);
                return null
            }
            throw err;
        });
}

/**
 * Creates a role if it doesn't already exist. If it does exist, it just returns
 * information about the existing role.
 */
exports.createRoleIfNotExists = function (roleName, trustedService) {
    return exports.getRole(roleName)
        .then(role => {
            if (!role) {
                return exports.createRole(roleName, trustedService);
            }
            else {
                return role;
            }
        });
}

/**
 * Gets information about a policy for the given policy ARN, or returns
 * null if the policy doesn't exist
 */
exports.getPolicy = function (policyArn) {
    const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
    var params = {
        PolicyArn: policyArn
    };
    winston.verbose(`Attempting to find policy ${policyArn}`);
    return iam.getPolicy(params).promise()
        .then(policy => {
            winston.verbose(`Found policy ${policyArn}`);
            return policy.Policy;
        })
        .catch(err => {
            if (err.code === 'NoSuchEntity') {
                winston.verbose(`Policy ${policyArn} does not exist`);
                return null;
            }
            throw err;
        });
}

/**
 * Creates the policy for the given name with the provided policy document.
 *
 * The policy document must be a valid IAM policy.
 */
exports.createPolicy = function (policyName, policyDocument) {
    const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
    var createParams = {
        PolicyDocument: JSON.stringify(policyDocument),
        PolicyName: policyName,
        Description: `Auto-generated policy for the service ${policyName}`,
        Path: '/services/'
    };
    winston.verbose(`Creating policy ${policyName}`);
    return iam.createPolicy(createParams).promise()
        .then(createResponse => {
            winston.verbose(`Created new policy ${policyName}`)
            return createResponse.Policy;
        });
}

/**
 * Given the ARN of a policy, creates a new version with the provided policy document.
 *
 * The policy document must be a valid IAM policy
 */
exports.createPolicyVersion = function (policyArn, policyDocument) {
    const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
    winston.verbose(`Creating new policy version for ${policyArn}`)
    var createVersionParams = {
        PolicyArn: policyArn,
        PolicyDocument: JSON.stringify(policyDocument),
        SetAsDefault: true
    };
    return iam.createPolicyVersion(createVersionParams).promise()
        .then(createVersionResponse => {
            winston.verbose(`Created new policy version for ${policyArn}`)
            return createVersionResponse.PolicyVersion;
        });
}

/**
 * Given the ARN of a policy, deletes all versions of the policy except for the list
 * of provided versions to keep (if any)
 */
exports.deleteAllPolicyVersionsButProvided = function (policyArn, policyVersionToKeep) {
    const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
    winston.verbose(`Deleting all old policy versions for ${policyArn} but ${policyVersionToKeep.VersionId}`);
    var listPolicyVersionsParams = {
        PolicyArn: policyArn
    };
    return iam.listPolicyVersions(listPolicyVersionsParams).promise()
        .then(policyVersionsResponse => {
            let deletePolicyPromises = [];
            for (let policyVersion of policyVersionsResponse.Versions) {
                if (policyVersion.VersionId !== policyVersionToKeep.VersionId) {
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
            winston.verbose(`Deleted all old policy versions for ${policyArn} but ${policyVersionToKeep.VersionId}`)
            return policyVersionToKeep; //Return kept version
        });
}

/**
 * Attaches the given policy to the given role
 */
exports.attachPolicyToRole = function (policyArn, roleName) {
    const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
    winston.verbose(`Attaching policy ${policyArn} to role ${roleName}`)
    var params = {
        PolicyArn: policyArn,
        RoleName: roleName
    };
    return iam.attachRolePolicy(params).promise()
        .then(attachResponse => {
            winston.verbose(`Attached policy ${policyArn} to role ${roleName}`)
            return attachResponse;
        });
}

exports.attachStreamPolicy = function (roleName, policyStatementsToConsume, accountConfig) {
    let policyArn = `arn:aws:iam::${accountConfig.account_id}:policy/services/${roleName}-dynamodb-stream`;
    let policyDocument = exports.constructPolicyDoc(policyStatementsToConsume);
    return exports.createOrUpdatePolicy(`${roleName}-dynamodb-stream`, policyArn, policyDocument)
        .then((policy) => {
            return exports.attachPolicyToRole(policy.Arn, roleName)
                .then(() => {
                    return policy;
                })
        })
        .catch(err => {
            throw err;
        })
}

/**
 * Detaches all policies from the given role
 */
exports.detachPoliciesFromRole = function (roleName) {
    const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
    winston.debug(`Detaching custom policies from ${roleName}`);
    return exports.getRole(roleName)
        .then(role => {
            if (role) {
                let listAttachedParams = {
                    RoleName: roleName
                };
                winston.debug(`Attempting to find policies attached to ${roleName}`);
                return iam.listAttachedRolePolicies(listAttachedParams).promise()
                    .then((policies) => {
                        let detachPromises = [];

                        policies.AttachedPolicies.forEach((policy) => {
                            let detachParams = {
                                PolicyArn: policy.PolicyArn,
                                RoleName: roleName
                            };
                            detachPromises.push(iam.detachRolePolicy(detachParams).promise());
                        });

                        return Promise.all(detachPromises);
                    });
            }
            else {
                return Promise.resolve([]);
            }
        });
}

/**
 * Creates or updates the given policy with the provided policy document.
 *
 * The policy document must be a valid IAM policy.
 *
 * This method will delete all versions of the policy but the one that was created by
 * itself.
 */
exports.createOrUpdatePolicy = function (policyName, policyArn, policyDocument) {
    return exports.getPolicy(policyArn)
        .then(policy => {
            if (!policy) { //Create
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

/**
 * Given a policy document, this method will create the policy if it doesn't already exist.
 */
exports.createPolicyIfNotExists = function (policyName, policyArn, policyDocument) {
    return exports.getPolicy(policyArn)
        .then(policy => {
            if (!policy) { //Create
                return exports.createPolicy(policyName, policyDocument);
            }
            return policy;
        });
}

/**
 * Given a list of policy statements, this method will construct a valid IAM policy document.
 *
 * This method assumes all provided policy statements are valid statements from an IAM policy document.
 */
exports.constructPolicyDoc = function (policyStatements) {
    let policyDocument = {
        Version: "2012-10-17",
        Statement: []
    };
    for (let policyStatement of policyStatements) {
        policyDocument.Statement.push(policyStatement);
    }
    return policyDocument;
}

/**
 * List roles
 * 
 * This method is used to determine the account id
 */
exports.showAccount = function () {
    const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
    let parmLstRoles = { MaxItems: 1 };
    winston.verbose('Finding account ID');
    return iam.listRoles(parmLstRoles).promise()
        .then(rsp => {
            if (!rsp || !rsp.Roles || rsp.Roles.length < 1 || !rsp.Roles[0].Arn || rsp.Roles[0].Arn.indexOf('arn:aws:iam::') != 0) { return null };
            let acctId = rsp.Roles[0].Arn.split(':')[4];
            winston.verbose(`Found account ID: ${acctId}`);
            return parseInt(acctId, 10);
        });
}
