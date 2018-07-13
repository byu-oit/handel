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
import {
    AccountConfig,
    DeployContext,
    ServiceConfig,
    ServiceContext,
    ServiceEventType,
} from 'handel-extension-api';
import * as winston from 'winston';
import * as iamCalls from '../../aws/iam-calls';
import * as lambdaCalls from '../../aws/lambda-calls';
import * as iotDeployersCommon from '../../common/iot-deployers-common';
import * as util from '../../common/util';
import { LambdaEventSourceConfig, LambdaServiceConfig } from './config-types';

async function attachEventSourcePolicy(roleName: string, eventSourceType: string, policyStatementsToConsume: any[], accountConfig: AccountConfig): Promise<AWS.IAM.Policy> {
    const policyName = `${roleName}-${eventSourceType}`;
    const policyArn = `arn:aws:iam::${accountConfig.account_id}:policy/services/${policyName}`;
    const policyDocument = iamCalls.constructPolicyDoc(policyStatementsToConsume);
    const policy = await iamCalls.createOrUpdatePolicy(policyName, policyArn, policyDocument);
    await iamCalls.attachPolicyToRole(policy.Arn!, roleName);
    return policy;
}

async function addEventSourceMapping(ownServiceContext: ServiceContext<LambdaServiceConfig>, ownDeployContext: DeployContext, eventConsumerConfig: LambdaEventSourceConfig, producerServiceContext: ServiceContext<ServiceConfig>, producerDeployContext: DeployContext, eventSourcePolicyStatements: any) {
    if(!ownDeployContext.eventOutputs || !producerDeployContext.eventOutputs) {
        throw new Error(`Both the consumer and producer must return event outputs from their deploy`);
    }
    const functionName = ownDeployContext.eventOutputs.resourceName;

    // Get event outputs from the producer
    const resourceArn = producerDeployContext.eventOutputs.resourceArn;
    const resourceName = producerDeployContext.eventOutputs.resourceName;
    if(!functionName || !resourceArn || !resourceName) {
        throw new Error(`Expected to receive function name, producer resource ARN, and producer resource name from event outputs`);
    }

    // Attach permissions to call the queue to the Lambda
    await attachEventSourcePolicy(ownServiceContext.stackName(), producerDeployContext.serviceType.name, eventSourcePolicyStatements, ownServiceContext.accountConfig);

    // Add the event source mapping to the Lambda
    await lambdaCalls.addLambdaEventSourceMapping(functionName, resourceName, resourceArn, eventConsumerConfig.batch_size);
}

export async function consumeSqsEvents(ownServiceContext: ServiceContext<LambdaServiceConfig>, ownDeployContext: DeployContext, eventConsumerConfig: LambdaEventSourceConfig, producerServiceContext: ServiceContext<ServiceConfig>, producerDeployContext: DeployContext) {
    if(!producerDeployContext.eventOutputs) {
        throw new Error(`Both the consumer and producer must return event outputs from their deploy`);
    }
    const resourceArn = producerDeployContext.eventOutputs.resourceArn;
    const policyStatementsToConsume = JSON.parse(util.readFileSync(`${__dirname}/sqs-events-statements.json`));
    policyStatementsToConsume[0].Resource = [];
    policyStatementsToConsume[0].Resource.push(resourceArn);
    return addEventSourceMapping(ownServiceContext, ownDeployContext, eventConsumerConfig, producerServiceContext, producerDeployContext, policyStatementsToConsume);
}

export async function consumeDynamoEvents(ownServiceContext: ServiceContext<LambdaServiceConfig>, ownDeployContext: DeployContext, eventConsumerConfig: LambdaEventSourceConfig, producerServiceContext: ServiceContext<ServiceConfig>, producerDeployContext: DeployContext) {
    if(!producerDeployContext.eventOutputs) {
        throw new Error(`Both the consumer and producer must return event outputs from their deploy`);
    }
    const resourceArn = producerDeployContext.eventOutputs.resourceArn;
    if(!resourceArn) {
        throw new Error('Expected resource arn from the producer');
    }
    const policyStatementsToConsume = JSON.parse(util.readFileSync(`${__dirname}/dynamo-events-statements.json`));
    policyStatementsToConsume[0].Resource = [];
    const tableStreamGeneralArn = resourceArn.substring(0, resourceArn.lastIndexOf('/') + 1).concat('*');
    policyStatementsToConsume[0].Resource.push(tableStreamGeneralArn);
    return addEventSourceMapping(ownServiceContext, ownDeployContext, eventConsumerConfig, producerServiceContext, producerDeployContext, policyStatementsToConsume);
}

export async function addProducePermissions(producerServiceContext: ServiceContext<ServiceConfig>, producerDeployContext: DeployContext, ownDeployContext: DeployContext, ownServiceContext: ServiceContext<LambdaServiceConfig>) {
    if(!ownDeployContext.eventOutputs || !producerDeployContext.eventOutputs) {
        throw new Error(`Both the consumer and producer must return event outputs from their deploy`);
    }

    const functionName = ownDeployContext.eventOutputs.resourceName;
    if(!functionName) {
        throw new Error(`Expected to get function name for event binding`);
    }
    const principal = producerDeployContext.eventOutputs.resourcePrincipal;
    let sourceArn;
    // TODO - Figure out how to deal with IoT better
    if (producerDeployContext.eventOutputs.serviceEventType === ServiceEventType.IoT) {
        sourceArn = iotDeployersCommon.getTopicRuleArn(producerDeployContext.eventOutputs.resourceArn!, ownServiceContext.serviceName);
    }
    else {
        sourceArn = producerDeployContext.eventOutputs.resourceArn!;
    }

    await lambdaCalls.addLambdaPermissionIfNotExists(functionName, principal, sourceArn);
}

export async function deleteEventSourcePolicies(roleName: string) {
    winston.debug(`Detaching custom policies from ${roleName}`);
    const role = await iamCalls.getRole(roleName);
    if (role) {
        const attachedPolicies = await iamCalls.listAttachedPolicies(roleName);
        // Detach policies
        await Promise.all(attachedPolicies.map(attachedPolicy => iamCalls.detachPolicyFromRole(roleName, attachedPolicy)));
        // Delete policies
        await Promise.all(attachedPolicies.map(attachedPolicy => iamCalls.deletePolicy(attachedPolicy.PolicyArn!)));
    }
    // If no role, then don't do anything
}
