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
import * as fs from 'fs';
import {
    AccountConfig,
    DeployContext,
    EnvironmentVariables,
    ServiceConfig,
    ServiceContext,
    Tags } from 'handel-extension-api';
import * as extensionSupport from 'handel-extension-support';
import * as os from 'os';
import * as winston from 'winston';
import * as iamCalls from '../aws/iam-calls';
import * as s3Calls from '../aws/s3-calls';
import * as util from '../common/util';

/**
 * Do a one-time creation of the custom role.
 *
 * Subsequent runs will not update the role's policy. If the policy needs to be changed, the role will need to be recreated.
 */
export async function createCustomRole(trustedService: string, roleName: string, policyStatementsToConsume: any[], accountConfig: AccountConfig) {
    const role = await iamCalls.getRole(roleName);
    if (!role) {
        const createdRole = await iamCalls.createRole(roleName, trustedService);
        if (policyStatementsToConsume.length > 0) { // Only add policies if there are any to consume
            const policyArn = `arn:aws:iam::${accountConfig.account_id}:policy/services/${roleName}`;
            const policyDocument = iamCalls.constructPolicyDoc(policyStatementsToConsume);
            const policy = await iamCalls.createOrUpdatePolicy(roleName, policyArn, policyDocument);
            const policyAttachment = await iamCalls.attachPolicyToRole(policy.Arn!, roleName);
            return iamCalls.getRole(roleName);
        }
        else { // No policies on the role
            return iamCalls.getRole(roleName);
        }
    }
    else {
        return role;
    }
}

export function getAllPolicyStatementsForServiceRole(ownServicePolicyStatements: any[], dependenciesDeployContexts: any[]): any[] {
    const policyStatementsToConsume = [];

    // Add policies from dependencies that have them
    for (const deployContext of dependenciesDeployContexts) {
        for (const policyDoc of deployContext.policies) {
            policyStatementsToConsume.push(policyDoc);
        }
    }

    // Let consuming service add its own policy if needed
    for (const ownServicePolicyStatement of ownServicePolicyStatements) {
        policyStatementsToConsume.push(ownServicePolicyStatement);
    }

    return policyStatementsToConsume;
}

export function getAppSecretsAccessPolicyStatements(serviceContext: ServiceContext<ServiceConfig>) {
    const applicationParameters = `arn:aws:ssm:${serviceContext.accountConfig.region}:${serviceContext.accountConfig.account_id}:parameter/${serviceContext.appName}.${serviceContext.environmentName}*`;
    return [
        {
            Effect: 'Allow',
            Action: [
                'ssm:DescribeParameters'
            ],
            Resource: [
                '*'
            ]
        },
        {
            Effect: 'Allow',
            Action: [
                'ssm:GetParameters',
                'ssm:GetParameter'
            ],
            Resource: [
                applicationParameters,
                `arn:aws:ssm:${serviceContext.accountConfig.region}:${serviceContext.accountConfig.account_id}:parameter/handel.global*`
            ]
        },
        {
            Effect: 'Allow',
            Action: [
                'ssm:PutParameter',
                'ssm:DeleteParameter',
                'ssm:DeleteParameters'
            ],
            Resource: [
                applicationParameters
            ]
        }
    ];
}
