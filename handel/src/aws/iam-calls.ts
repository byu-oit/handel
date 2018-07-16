/*
 * Copyright 2018 Brigham Young University
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
import * as AWS from 'aws-sdk';
import * as winston from 'winston';
import awsWrapper from './aws-wrapper';

/**
 * Given a role name, creates the role with the given trusted service.
 *
 * The created role is only assumable by the provided trusted service. For example,
 * if you provide 'ec2.amazonaws.com' as the trusted service, only EC2 instances
 * will be able to assume that role.
 */
export async function createRole(roleName: string, trustedService: string): Promise<AWS.IAM.Role> {
    const assumeRolePolicyDoc = {
        'Version': '2012-10-17',
        'Statement': [
            {
                'Effect': 'Allow',
                'Principal': {
                    'Service': trustedService
                },
                'Action': 'sts:AssumeRole'
            }
        ]
    };
    const createParams = {
        AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDoc),
        Path: '/services/',
        RoleName: roleName
    };
    winston.verbose(`Creating role ${roleName}`);
    const createResponse = await awsWrapper.iam.createRole(createParams);
    winston.verbose(`Created role ${roleName}`);
    return createResponse.Role;

}

/**
 * Given a role name, returns information about that role, or null if
 * the role doesn't exist
 */
export async function getRole(roleName: string): Promise<AWS.IAM.Role | null> {
    const getParams = {
        RoleName: roleName
    };
    winston.verbose(`Attempting to find role ${roleName}`);
    try {
        const role = await awsWrapper.iam.getRole(getParams);
        winston.verbose(`Found role ${roleName}`);
        return role.Role;
    }
    catch (err) {
        if (err.code === 'NoSuchEntity') {
            winston.verbose(`Role ${roleName} does not exist`);
            return null;
        }
        throw err;
    }
}

/**
 * Creates a role if it doesn't already exist. If it does exist, it just returns
 * information about the existing role.
 */
export async function createRoleIfNotExists(roleName: string, trustedService: string): Promise<AWS.IAM.Role> {
    const role = await exports.getRole(roleName);
    if (!role) {
        return exports.createRole(roleName, trustedService);
    }
    else {
        return role;
    }
}

/**
 * Gets information about a policy for the given policy ARN, or returns
 * null if the policy doesn't exist
 */
export async function getPolicy(policyArn: string): Promise<AWS.IAM.Policy | null> {
    const params = {
        PolicyArn: policyArn
    };
    winston.verbose(`Attempting to find policy ${policyArn}`);

    try {
        const policy = await awsWrapper.iam.getPolicy(params);
        winston.verbose(`Found policy ${policyArn}`);
        if (policy.Policy) {
            return policy.Policy;
        }
        else {
            return null;
        }
    }
    catch (err) {
        if (err.code === 'NoSuchEntity') {
            winston.verbose(`Policy ${policyArn} does not exist`);
            return null;
        }
        throw err;
    }
}

/**
 * Creates the policy for the given name with the provided policy document.
 *
 * The policy document must be a valid IAM policy.
 */
export async function createPolicy(policyName: string, policyDocument: any): Promise<AWS.IAM.Policy> {
    const createParams = {
        PolicyDocument: JSON.stringify(policyDocument),
        PolicyName: policyName,
        Description: `Auto-generated policy for the service ${policyName}`,
        Path: '/services/'
    };
    winston.verbose(`Creating policy ${policyName}`);
    const createResponse = await awsWrapper.iam.createPolicy(createParams);
    winston.verbose(`Created new policy ${policyName}`);
    return createResponse.Policy!;
}

/**
 * Given the ARN of a policy, creates a new version with the provided policy document.
 *
 * The policy document must be a valid IAM policy
 */
export async function createPolicyVersion(policyArn: string, policyDocument: any): Promise<AWS.IAM.PolicyVersion> {
    winston.verbose(`Creating new policy version for ${policyArn}`);
    const createVersionParams = {
        PolicyArn: policyArn,
        PolicyDocument: JSON.stringify(policyDocument),
        SetAsDefault: true
    };
    const createVersionResponse = await awsWrapper.iam.createPolicyVersion(createVersionParams);
    winston.verbose(`Created new policy version for ${policyArn}`);
    return createVersionResponse.PolicyVersion!;
}

/**
 * Given the ARN of a policy, deletes all versions of the policy except for the list
 * of provided versions to keep (if any)
 */
export async function deleteAllPolicyVersionsButProvided(policyArn: string, policyVersionToKeep: AWS.IAM.PolicyVersion): Promise<AWS.IAM.PolicyVersion> {
    winston.verbose(`Deleting all old policy versions for ${policyArn} but ${policyVersionToKeep.VersionId}`);
    const listPolicyVersionsParams = {
        PolicyArn: policyArn
    };
    const policyVersionsResponse = await awsWrapper.iam.listPolicyVersions(listPolicyVersionsParams);
    const deletePolicyPromises = [];
    for (const policyVersion of policyVersionsResponse.Versions!) {
        if (policyVersion.VersionId !== policyVersionToKeep.VersionId) {
            const deleteVersionParams = {
                PolicyArn: policyArn,
                VersionId: policyVersion.VersionId!
            };
            deletePolicyPromises.push(awsWrapper.iam.deletePolicyVersion(deleteVersionParams));
        }

    }
    await Promise.all(deletePolicyPromises);
    winston.verbose(`Deleted all old policy versions for ${policyArn} but ${policyVersionToKeep.VersionId}`);
    return policyVersionToKeep; // Return kept version
}

/**
 * Creates or updates the given policy with the provided policy document.
 *
 * The policy document must be a valid IAM policy.
 *
 * This method will delete all versions of the policy but the one that was created by
 * itself.
 */
export async function createOrUpdatePolicy(policyName: string, policyArn: string, policyDocument: any): Promise<AWS.IAM.Policy> {
    const policy = await getPolicy(policyArn);
    if (!policy) { // Create
        return createPolicy(policyName, policyDocument);
    }
    else { // Update
        const policyVersion = await exports.createPolicyVersion(policyArn, policyDocument);
        const keptPolicyVersion = await deleteAllPolicyVersionsButProvided(policyArn, policyVersion);
        const updatedPolicy = await getPolicy(policyArn);
        return updatedPolicy!;
    }
}

/**
 * Attaches the given policy to the given role
 */
export async function attachPolicyToRole(policyArn: string, roleName: string) {
    winston.verbose(`Attaching policy ${policyArn} to role ${roleName}`);
    const params = {
        PolicyArn: policyArn,
        RoleName: roleName
    };
    const attachResponse = await awsWrapper.iam.attachRolePolicy(params);
    winston.verbose(`Attached policy ${policyArn} to role ${roleName}`);
    return attachResponse;
}

/**
 * Given a policy document, this method will create the policy if it doesn't already exist.
 */
export async function createPolicyIfNotExists(policyName: string, policyArn: string, policyDocument: any) {
    const policy = await getPolicy(policyArn);
    if (!policy) { // Create
        return createPolicy(policyName, policyDocument);
    }
    return policy;
}

export async function listAttachedPolicies(roleName: string): Promise<AWS.IAM.AttachedPolicy[]> {
    const listAttachedParams = {
        RoleName: roleName
    };
    const policies = await awsWrapper.iam.listAttachedRolePolicies(listAttachedParams);
    return policies.AttachedPolicies || [];
}

export async function detachPolicyFromRole(roleName: string, policy: AWS.IAM.AttachedPolicy): Promise<void> {
    const detachParams: AWS.IAM.DetachRolePolicyRequest = {
        PolicyArn: policy.PolicyArn!,
        RoleName: roleName
    };
    await awsWrapper.iam.detachRolePolicy(detachParams);
}

export async function deletePolicy(policyArn: string) {
    const deleteParams: AWS.IAM.DeletePolicyRequest = {
        PolicyArn: policyArn
    };
    await awsWrapper.iam.deletePolicy(deleteParams);
}

/**
 * Given a list of policy statements, this method will construct a valid IAM policy document.
 *
 * This method assumes all provided policy statements are valid statements from an IAM policy document.
 */
export function constructPolicyDoc(policyStatements: any[]) {
    const policyDocument: any = {
        Version: '2012-10-17',
        Statement: []
    };
    for (const policyStatement of policyStatements) {
        policyDocument.Statement.push(policyStatement);
    }
    return policyDocument;
}
