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

async function getSnsPolicyDoc(topicArn: string): Promise<any> {
    const getTopicAttributesParams: AWS.SNS.GetTopicAttributesInput = {
        TopicArn: topicArn
    };

    const topicAttributesResponse = await awsWrapper.sns.getTopicAttributes(getTopicAttributesParams);
    const policy = topicAttributesResponse.Attributes!.Policy;
    if (policy) {
        const policyDoc = JSON.parse(policy);
        return policyDoc;
    }
    else {
        return null; // No policy defined
    }
}

export async function addSnsPermission(topicArn: string, sourceArn: string, policyStatement: any) {
    let policyDoc = await getSnsPolicyDoc(topicArn);
    if (policyDoc) { // Update existing policy
        policyDoc.Statement.push(policyStatement);
    }
    else { // Create new policy
        policyDoc = {
            'Version': '2012-10-17',
            'Statement': [policyStatement]
        };
    }

    const setTopicAttributesParams = {
        AttributeName: 'Policy',
        TopicArn: topicArn,
        AttributeValue: JSON.stringify(policyDoc)
    };
    winston.verbose(`Adding permission to SNS topic ${topicArn} from ${sourceArn}`);
    const topicAttributesResponse = await awsWrapper.sns.setTopicAttributes(setTopicAttributesParams);
    winston.verbose(`Added permission to SNS Topic ${topicArn} from ${sourceArn}`);
    return topicAttributesResponse;
}

export async function getSnsPermission(topicArn: string, policyStatementToGet: any) {
    winston.verbose(`Attempting to find permission in policy doc for ${topicArn}`);
    const policyDoc = await getSnsPolicyDoc(topicArn);
    if (policyDoc) {
        const permissionFromPolicyDoc = getPermissionInPolicyDoc(policyDoc, policyStatementToGet);
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
}

export async function addSnsPermissionIfNotExists(topicArn: string, sourceArn: string, policyStatement: any) {
    const permission = await getSnsPermission(topicArn, policyStatement);
    if (!permission) {
        await addSnsPermission(topicArn, sourceArn, policyStatement);
        return getSnsPermission(topicArn, policyStatement);
    }
    else {
        return permission;
    }
}

export async function subscribeToTopic(topicArn: string, protocol: string, endpoint: string) {
    const subscribeParams: AWS.SNS.SubscribeInput = {
        Protocol: protocol,
        TopicArn: topicArn,
        Endpoint: endpoint
    };
    winston.verbose(`Subscribing ${endpoint} to SNS topic ${topicArn}`);
    const subscribeResponse = await awsWrapper.sns.subscribe(subscribeParams);
    winston.verbose(`Subscribed ${endpoint} to SNS topic ${topicArn}`);
    return subscribeResponse.SubscriptionArn;
}
