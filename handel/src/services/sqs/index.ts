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
    ConsumeEventsContext,
    DeployContext,
    PreDeployContext,
    ServiceConfig,
    ServiceContext,
    UnDeployContext
} from 'handel-extension-api';
import { awsCalls, deletePhases, deployPhase, handlebars, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import * as sqsCalls from '../../aws/sqs-calls';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import { STDLIB_PREFIX } from '../stdlib';
import {HandlebarsSqsTemplate, SqsServiceConfig} from './config-types';

const SERVICE_NAME = 'SQS';

function getCompiledSqsTemplate(stackName: string, serviceContext: ServiceContext<SqsServiceConfig>): Promise<string> {
    const serviceParams = serviceContext.params;
    const handlebarsParams: HandlebarsSqsTemplate = {
        queueName: stackName,
        delaySeconds: 0,
        receiveMessageWaitTimeSeconds: 0,
        maxMessageSize: 262144,
        messageRetentionPeriod: 345600,
        visibilityTimeout: 30,
        deadLetterPolicy: false
    };
    if (serviceParams.queue_type && serviceParams.queue_type === 'fifo') {
        handlebarsParams.queueName = `${stackName}.fifo`; // FIFO queues require special suffix in name
        handlebarsParams.fifoQueue = true;
        handlebarsParams.contentBasedDeduplication = false; // Default to false
        if (serviceParams.content_based_deduplication) {
            handlebarsParams.contentBasedDeduplication = serviceParams.content_based_deduplication;
        }
    }
    if (serviceParams.delay_seconds) {
        handlebarsParams.delaySeconds = serviceParams.delay_seconds;
    }
    if (serviceParams.receive_message_wait_time_seconds) {
        handlebarsParams.receiveMessageWaitTimeSeconds = serviceParams.receive_message_wait_time_seconds;
    }
    if (serviceParams.max_message_size) {
        handlebarsParams.maxMessageSize = serviceParams.max_message_size;
    }
    if (serviceParams.message_retention_period) {
        handlebarsParams.messageRetentionPeriod = serviceParams.message_retention_period;
    }
    if (serviceParams.visibility_timeout) {
        handlebarsParams.visibilityTimeout = serviceParams.visibility_timeout;
    }
    if (serviceParams.dead_letter_queue) {
        handlebarsParams.redrivePolicy = true;
        const baseQueueName = handlebarsParams.queueName.replace('.fifo', '');
        handlebarsParams.deadLetterQueueName = baseQueueName + '-dead-letter';
        handlebarsParams.deadLetterMaxReceiveCount = 3;
        handlebarsParams.deadLetterDelaySeconds = 0;
        handlebarsParams.deadLetterMaxMessageSize = 262144;
        handlebarsParams.deadLetterMessageRetentionPeriod = 345600;
        handlebarsParams.deadLetterReceiveMessageWaitTimeSeconds = 0;
        handlebarsParams.deadLetterVisibilityTimeout = 30;
        if (serviceParams.dead_letter_queue.max_receive_count) {
            handlebarsParams.deadLetterMaxReceiveCount = serviceParams.dead_letter_queue.max_receive_count;
        }
        if (serviceParams.queue_type && serviceParams.queue_type === 'fifo') {
            handlebarsParams.deadLetterQueueName = handlebarsParams.deadLetterQueueName + '.fifo';
        }
        if (serviceParams.dead_letter_queue.delay_seconds) {
            handlebarsParams.deadLetterDelaySeconds = serviceParams.dead_letter_queue.delay_seconds;
        }
        if (serviceParams.dead_letter_queue.max_message_size) {
            handlebarsParams.deadLetterMaxMessageSize = serviceParams.dead_letter_queue.max_message_size;
        } else if (serviceParams.max_message_size) {
            handlebarsParams.deadLetterMaxMessageSize = serviceParams.max_message_size;
        }
        if (serviceParams.dead_letter_queue.message_retention_period) {
            handlebarsParams.deadLetterMessageRetentionPeriod = serviceParams.dead_letter_queue.message_retention_period;
        } else if (serviceParams.message_retention_period) {
            handlebarsParams.deadLetterMessageRetentionPeriod = serviceParams.message_retention_period;
        }
        if (serviceParams.dead_letter_queue.receive_message_wait_time_seconds) {
            handlebarsParams.deadLetterReceiveMessageWaitTimeSeconds = serviceParams.dead_letter_queue.receive_message_wait_time_seconds;
        } else if (serviceParams.receive_message_wait_time_seconds) {
            handlebarsParams.deadLetterReceiveMessageWaitTimeSeconds = serviceParams.receive_message_wait_time_seconds;
        }
        if (serviceParams.dead_letter_queue.visibility_timeout) {
            handlebarsParams.deadLetterVisibilityTimeout = serviceParams.dead_letter_queue.visibility_timeout;
        } else if (serviceParams.visibility_timeout) {
            handlebarsParams.deadLetterVisibilityTimeout = serviceParams.visibility_timeout;
        }
    }

    return handlebars.compileTemplate(`${__dirname}/sqs-template.yml`, handlebarsParams);
}

function getDeployContext(serviceContext: ServiceContext<SqsServiceConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    const queueName = awsCalls.cloudFormation.getOutput('QueueName', cfStack);
    const queueArn = awsCalls.cloudFormation.getOutput('QueueArn', cfStack);
    const queueUrl = awsCalls.cloudFormation.getOutput('QueueUrl', cfStack);
    if(!queueName || !queueArn || !queueUrl) {
        throw new Error('Expected to receive queue name, ARN, and URL from SQS service');
    }

    const deployContext = new DeployContext(serviceContext);

    // Env variables to inject into consuming services
    deployContext.addEnvironmentVariables({
        QUEUE_NAME: queueName,
        QUEUE_ARN: queueArn,
        QUEUE_URL: queueUrl
    });

    // Add event outputs for event consumption
    deployContext.eventOutputs.queueUrl = queueUrl;
    deployContext.eventOutputs.queueArn = queueArn;

    // Policy to talk to this queue
    deployContext.policies.push({
        'Effect': 'Allow',
        'Action': [
            'sqs:ChangeMessageVisibility',
            'sqs:ChangeMessageVisibilityBatch',
            'sqs:DeleteMessage',
            'sqs:DeleteMessageBatch',
            'sqs:GetQueueAttributes',
            'sqs:GetQueueUrl',
            'sqs:ListDeadLetterSourceQueues',
            'sqs:ListQueues',
            'sqs:PurgeQueue',
            'sqs:ReceiveMessage',
            'sqs:SendMessage',
            'sqs:SendMessageBatch'
        ],
        'Resource': [
            queueArn
        ]
    });

    // Add exports if a dead letter queue was specified
    const deadLetterQueueName = awsCalls.cloudFormation.getOutput('DeadLetterQueueName', cfStack);
    if (deadLetterQueueName) {
        const deadLetterQueueArn = awsCalls.cloudFormation.getOutput('DeadLetterQueueArn', cfStack);
        const deadLetterQueueUrl = awsCalls.cloudFormation.getOutput('DeadLetterQueueUrl', cfStack);
        if(!deadLetterQueueArn || !deadLetterQueueUrl) {
            throw new Error('Expected to receive dead letter queue ARN and URL back from SQS service');
        }

        deployContext.addEnvironmentVariables({
            DEAD_LETTER_QUEUE_NAME: deadLetterQueueName,
            DEAD_LETTER_QUEUE_ARN: deadLetterQueueArn,
            DEAD_LETTER_QUEUE_URL: deadLetterQueueUrl
        });

        deployContext.eventOutputs.deadLetterQueueUrl = deadLetterQueueUrl;
        deployContext.eventOutputs.deadLetterQueueArn = deadLetterQueueArn;

        deployContext.policies[0].Resource.push(deadLetterQueueArn);
    }

    return deployContext;
}

function getPolicyStatementForSqsEventConsumption(queueArn: string, producerArn: string): any {
    return {
        Effect: 'Allow',
        Principal: '*',
        Action: 'sqs:SendMessage',
        Resource: queueArn,
        Condition: {
            ArnEquals: {
                'aws:SourceArn': producerArn
            }
        }
    };
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<SqsServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    return [];
}

export async function deploy(ownServiceContext: ServiceContext<SqsServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = ownServiceContext.stackName();
    winston.info(`${SERVICE_NAME} - Deploying queue '${stackName}'`);

    const sqsTemplate = await getCompiledSqsTemplate(stackName, ownServiceContext);
    const stackTags = tagging.getTags(ownServiceContext);
    const deployedStack = await deployPhase.deployCloudFormationStack(stackName, sqsTemplate, [], true, SERVICE_NAME, 30, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying queue '${stackName}'`);
    return getDeployContext(ownServiceContext, deployedStack);
}

export async function consumeEvents(ownServiceContext: ServiceContext<SqsServiceConfig>, ownDeployContext: DeployContext, producerServiceContext: ServiceContext<ServiceConfig>, producerDeployContext: DeployContext): Promise<ConsumeEventsContext> {
    winston.info(`${SERVICE_NAME} - Consuming events from service '${producerServiceContext.serviceName}' for service '${ownServiceContext.serviceName}'`);
    const queueUrl = ownDeployContext.eventOutputs.queueUrl;
    const queueArn = ownDeployContext.eventOutputs.queueArn;
    const producerServiceType = producerServiceContext.serviceType;
    let producerArn;
    if (producerServiceType.matches(STDLIB_PREFIX, 'sns')) {
        producerArn = producerDeployContext.eventOutputs.topicArn;
    }
    else if (producerServiceType.matches(STDLIB_PREFIX, 's3')) {
        producerArn = producerDeployContext.eventOutputs.bucketArn;
    }
    else {
        throw new Error(`${SERVICE_NAME} - Unsupported event producer type given: ${producerServiceType}`);
    }

    const policyStatement = getPolicyStatementForSqsEventConsumption(queueArn, producerArn);

    // Add SQS permission
    const permissionStatement = await sqsCalls.addSqsPermissionIfNotExists(queueUrl, queueArn, producerArn, policyStatement);
    winston.info(`${SERVICE_NAME} - Allowed consuming events from '${producerServiceContext.serviceName}' for '${ownServiceContext.serviceName}'`);
    return new ConsumeEventsContext(ownServiceContext, producerServiceContext);
}

export async function unDeploy(ownServiceContext: ServiceContext<SqsServiceConfig>): Promise<UnDeployContext> {
    return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

export const consumedDeployOutputTypes = [];

export const supportsTagging = true;
