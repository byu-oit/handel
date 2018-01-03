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
import * as winston from 'winston';
import awsWrapper from './aws-wrapper';

function getPermissionInPolicyDoc(policyDoc: any, policyStatement: any): any {
    for (const statement of policyDoc.Statement) {
        const statementJson = JSON.stringify(statement);
        const policyStatementJson = JSON.stringify(policyStatement);
        if (statementJson === policyStatementJson) {
            return statement;
        }
    }
    return null;
}

async function getSqsQueuePolicyDoc(queueUrl: string): Promise<any> {
    const getQueueAttributesParams = {
        AttributeNames: [
            'All'
        ],
        QueueUrl: queueUrl
    };

    const queueAttributesResponse = await awsWrapper.sqs.getQueueAttributes(getQueueAttributesParams);
    const policy = queueAttributesResponse.Attributes!.Policy;
    if (policy) {
        const policyDoc = JSON.parse(policy);
        return policyDoc;
    }
    else {
        return null; // No policy defined
    }
}

export async function addSqsPermission(queueUrl: string, queueArn: string, sourceArn: string, policyStatement: any): Promise<any> {
    let policyDoc = await getSqsQueuePolicyDoc(queueUrl);
    if (policyDoc) { // Update existing policy
        policyDoc.Statement.push(policyStatement);
    }
    else { // Create new policy
        policyDoc = {
            'Version': '2012-10-17',
            'Statement': [policyStatement]
        };
    }

    const setQueueAttributesParams = {
        Attributes: {
            Policy: JSON.stringify(policyDoc)
        },
        QueueUrl: queueUrl
    };
    winston.verbose(`Adding permission to SQS queue ${queueUrl} from ${sourceArn}`);
    const queueAttributesResponse = await awsWrapper.sqs.setQueueAttributes(setQueueAttributesParams);
    winston.verbose(`Added permission to SQS queue ${queueUrl} from ${sourceArn}`);
    return queueAttributesResponse;
}

export async function getSqsPermission(queueUrl: string, policyStatementToGet: any): Promise<any> {
    winston.verbose(`Attempting to find permission in policy doc for ${queueUrl}`);
    const policyDoc = await getSqsQueuePolicyDoc(queueUrl);
    if (policyDoc) {
        const permissionFromPolicyDoc = getPermissionInPolicyDoc(policyDoc, policyStatementToGet);
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
}

export async function addSqsPermissionIfNotExists(queueUrl: string, queueArn: string, sourceArn: string, policyStatement: any): Promise<any> {
    const permission = await getSqsPermission(queueUrl, policyStatement);
    if (!permission) {
        await addSqsPermission(queueUrl, queueArn, sourceArn, policyStatement);
        return getSqsPermission(queueUrl, policyStatement);
    }
    else {
        return permission;
    }
}
