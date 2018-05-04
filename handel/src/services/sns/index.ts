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
import { ServiceEventConsumer } from 'handel-extension-api';
import {
    ConsumeEventsContext,
    DeployContext,
    PreDeployContext,
    ProduceEventsContext,
    ServiceConfig,
    ServiceContext,
    UnDeployContext
} from 'handel-extension-api';
import { awsCalls, deletePhases, deployPhase, handlebars, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import * as snsCalls from '../../aws/sns-calls';
import { STDLIB_PREFIX } from '../stdlib';
import {SnsServiceConfig} from './config-types';

const SERVICE_NAME = 'SNS';

function getCompiledSnsTemplate(stackName: string, serviceContext: ServiceContext<SnsServiceConfig>): Promise<string> {
    const handlebarsParams = {
        subscriptions: serviceContext.params.subscriptions,
        topicName: stackName
    };
    return handlebars.compileTemplate(`${__dirname}/sns-template.yml`, handlebarsParams);
}

function getDeployContext(serviceContext: ServiceContext<SnsServiceConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    const topicName = awsCalls.cloudFormation.getOutput('TopicName', cfStack);
    const topicArn = awsCalls.cloudFormation.getOutput('TopicArn', cfStack);
    if(!topicName || !topicArn) {
        throw new Error('Expected to receive topic name and ARN back from SNS service');
    }

    const deployContext = new DeployContext(serviceContext);

    // Event outputs for consumers of SNS events
    deployContext.eventOutputs.topicArn = topicArn;
    deployContext.eventOutputs.principal = 'sns.amazonaws.com';

    // Env variables to inject into consuming services
    deployContext.addEnvironmentVariables({
        TOPIC_ARN: topicArn,
        TOPIC_NAME: topicName
    });

    // Policy to talk to this queue
    deployContext.policies.push({
        'Effect': 'Allow',
        'Action': [
            'sns:ConfirmSubscription',
            'sns:GetEndpointAttributes',
            'sns:GetPlatformApplicationAttributes',
            'sns:GetSMSAttributes',
            'sns:GetSubscriptionAttributes',
            'sns:GetTopicAttributes',
            'sns:ListEndpointsByPlatformApplication',
            'sns:ListPhoneNumbersOptedOut',
            'sns:ListSubscriptions',
            'sns:ListSubscriptionsByTopic',
            'sns:ListTopics',
            'sns:OptInPhoneNumber',
            'sns:Publish',
            'sns:Subscribe',
            'sns:Unsubscribe'
        ],
        'Resource': [
            topicArn
        ]
    });

    return deployContext;
}

function getPolicyStatementForEventConsumption(topicArn: string, trustedService: string): any {
    return {
        Effect: 'Allow',
        Principal: {
            Service: trustedService
        },
        Action: 'sns:Publish',
        Resource: topicArn,
    };
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<SnsServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors = [];

    if (serviceContext.params.subscriptions) {

        for (const subscription of serviceContext.params.subscriptions) {
            const allowedValues = ['http', 'https', 'email', 'email-json', 'sms'];

            if (!subscription.endpoint) { errors.push(`${SERVICE_NAME} - A subscription requires an 'endpoint' parameter`); }
            if (!subscription.protocol) { errors.push(`${SERVICE_NAME} - A subscription requires a 'protocol' parameter`); }
            else if (!allowedValues.includes(subscription.protocol)) { errors.push(`${SERVICE_NAME} - Protocol must be one of ${allowedValues.join(', ')}`); }
        }
    }
    return errors;
}

export async function deploy(ownServiceContext: ServiceContext<SnsServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = ownServiceContext.stackName();
    winston.info(`${SERVICE_NAME} - Deploying topic '${stackName}'`);

    const compiledSnsTemplate = await getCompiledSnsTemplate(stackName, ownServiceContext);
    const stackTags = tagging.getTags(ownServiceContext);
    const deployedStack = await deployPhase.deployCloudFormationStack(stackName, compiledSnsTemplate, [], true, SERVICE_NAME, 30, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying topic '${stackName}'`);
    return getDeployContext(ownServiceContext, deployedStack);
}

export async function produceEvents(ownServiceContext: ServiceContext<SnsServiceConfig>, ownDeployContext: DeployContext, eventConsumerConfig: ServiceEventConsumer, consumerServiceContext: ServiceContext<ServiceConfig>, consumerDeployContext: DeployContext): Promise<ProduceEventsContext> {
    winston.info(`${SERVICE_NAME} - Producing events from '${ownServiceContext.serviceName}' for consumer '${consumerServiceContext.serviceName}'`);
    // Add subscription to sns service
    const topicArn = ownDeployContext.eventOutputs.topicArn;
    const consumerServiceType = consumerServiceContext.serviceType;
    let protocol;
    let endpoint;
    if (consumerServiceType.matches(STDLIB_PREFIX, 'lambda')) {
        protocol = 'lambda';
        endpoint = consumerDeployContext.eventOutputs.lambdaArn;
    }
    else if (consumerServiceType.matches(STDLIB_PREFIX, 'sqs')) {
        protocol = 'sqs';
        endpoint = consumerDeployContext.eventOutputs.queueArn;
    }
    else {
        throw new Error(`${SERVICE_NAME} - Unsupported event consumer type given: ${consumerServiceType}`);
    }

    const subscriptionArn = await snsCalls.subscribeToTopic(topicArn, protocol, endpoint);
    winston.info(`${SERVICE_NAME} - Configured production of events from '${ownServiceContext.serviceName}' for consumer '${consumerServiceContext.serviceName}'`);
    return new ProduceEventsContext(ownServiceContext, consumerServiceContext);
}

export async function consumeEvents(ownServiceContext: ServiceContext<SnsServiceConfig>, ownDeployContext: DeployContext, producerServiceContext: ServiceContext<ServiceConfig>, producerDeployContext: DeployContext): Promise<ConsumeEventsContext> {

    winston.info(`${SERVICE_NAME} - Consuming events from service '${producerServiceContext.serviceName}' for service '${ownServiceContext.serviceName}'`);
    const topicArn = ownDeployContext.eventOutputs.topicArn;
    const producerServiceType = producerServiceContext.serviceType;
    let producerArn;
    let policyStatement;
    if (producerServiceType.matches(STDLIB_PREFIX, 'cloudwatchevent')) {
        producerArn = producerDeployContext.eventOutputs.eventRuleArn;
        policyStatement = getPolicyStatementForEventConsumption(topicArn, 'events.amazonaws.com');
    }
    else if (producerServiceType.matches(STDLIB_PREFIX, 's3')) {
        producerArn = producerDeployContext.eventOutputs.bucketArn;
        policyStatement = getPolicyStatementForEventConsumption(topicArn, 's3.amazonaws.com');
    }
    else {
        throw new Error(`${SERVICE_NAME} - Unsupported event producer type given: ${producerServiceType}`);
    }

    // Add SNS permission
    const permissionStatement = await snsCalls.addSnsPermissionIfNotExists(topicArn, producerArn, policyStatement);
    winston.info(`${SERVICE_NAME} - Allowed consuming events from '${producerServiceContext.serviceName}' for '${ownServiceContext.serviceName}'`);
    return new ConsumeEventsContext(ownServiceContext, producerServiceContext);
}

export async function unDeploy(ownServiceContext: ServiceContext<SnsServiceConfig>): Promise<UnDeployContext> {
    return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedServices = [
    'lambda',
    'sqs'
];

export const producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

export const consumedDeployOutputTypes = [
    'cloudwatchevent'
];

export const supportsTagging = true;
