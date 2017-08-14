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
const winston = require('winston');
const handlebarsUtils = require('../../common/handlebars-utils');
const DeployContext = require('../../datatypes/deploy-context');
const ConsumeEventsContext = require('../../datatypes/consume-events-context');
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../common/bind-phase-common');
const sqsCalls = require('../../aws/sqs-calls');

const SERVICE_NAME = "SQS";

function getCompiledSqsTemplate(stackName, serviceContext) {
    let serviceParams = serviceContext.params;
    let handlebarsParams = {
        queueName: stackName,
        delaySeconds: 0,
        receiveMessageWaitTimeSeconds: 0,
        maxMessageSize: 262144,
        messageRetentionPeriod: 345600,
        visibilityTimeout: 30,
        deadLetterPolicy: false
    };
    if (serviceParams.queue_type && serviceParams.queue_type === 'fifo') {
        handlebarsParams.queueName = `${stackName}.fifo`; //FIFO queues require special suffix in name
        handlebarsParams.fifoQueue = true;
        handlebarsParams.contentBasedDeduplication = false; //Default to false
        if (serviceParams.content_based_deduplication) {
            handlebarsParams.contentBasedDeduplication = serviceParams.content_based_deduplication
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
        let baseQueueName = handlebarsParams.queueName.replace('.fifo', '');
        handlebarsParams.deadLetterQueueName = baseQueueName + '-dead-letter';
        handlebarsParams.deadLetterMaxReceiveCount = 3;
        handlebarsParams.deadLetterDelaySeconds = 0;
        handlebarsParams.deadLetterMaxMessageSize = 262144;
        handlebarsParams.deadLetterMessageRetentionPeriod = 345601;
        handlebarsParams.deadLetterReceiveMessageWaitTimeSeconds = 0;
        handlebarsParams.deadLetterVisibilityTimeout = 30;
        if (serviceParams.dead_letter_queue.max_receive_count) {
            handlebarsParams.deadLetterMaxReceiveCount = serviceParams.dead_letter_queue.max_receive_count;
        }
        if (serviceParams.dead_letter_queue.queue_type && serviceParams.dead_letter_queue.queue_type === 'fifo') {
            handlebarsParams.deadLetterQueueName = handlebarsParams.deadLetterQueueName + '.fifo';
            console.log('handlebarsParams.deadLetterQueueName: ', handlebarsParams.deadLetterQueueName)
            handlebarsParams.deadLetterFifoQueue = true;
            handlebarsParams.deadLetterContentBasedDeduplication = false; //Default to false
            if (serviceParams.dead_letter_queue.content_based_deduplication) {
                handlebarsParams.deadLetterContentBasedDeduplication = serviceParams.dead_letter_queue.content_based_deduplication;
            }
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

    return handlebarsUtils.compileTemplate(`${__dirname}/sqs-template.yml`, handlebarsParams)
}

function getDeployContext(serviceContext, cfStack) {
    let queueName = cloudFormationCalls.getOutput('QueueName', cfStack);
    let queueArn = cloudFormationCalls.getOutput('QueueArn', cfStack);
    let queueUrl = cloudFormationCalls.getOutput('QueueUrl', cfStack);
    let deadLetterQueueName = cloudFormationCalls.getOutput('DeadLetterQueueName', cfStack);
    let deadLetterQueueArn = cloudFormationCalls.getOutput('DeadLetterQueueArn', cfStack);
    let deadLetterQueueUrl = cloudFormationCalls.getOutput('DeadLetterQueueUrl', cfStack);
    let deployContext = new DeployContext(serviceContext);

    //Env variables to inject into consuming services
    let queueNameEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, 'QUEUE_NAME');
    deployContext.environmentVariables[queueNameEnv] = queueName;
    let queueArnEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, "QUEUE_ARN");
    deployContext.environmentVariables[queueArnEnv] = queueArn;
    let queueUrlEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, "QUEUE_URL");
    deployContext.environmentVariables[queueUrlEnv] = queueUrl;

    //Add event outputs for event consumption
    deployContext.eventOutputs.queueUrl = queueUrl;
    deployContext.eventOutputs.queueArn = queueArn;

    //Policy to talk to this queue
    deployContext.policies.push({
        "Effect": "Allow",
        "Action": [
            "sqs:ChangeMessageVisibility",
            "sqs:ChangeMessageVisibilityBatch",
            "sqs:DeleteMessage",
            "sqs:DeleteMessageBatch",
            "sqs:GetQueueAttributes",
            "sqs:GetQueueUrl",
            "sqs:ListDeadLetterSourceQueues",
            "sqs:ListQueues",
            "sqs:PurgeQueue",
            "sqs:ReceiveMessage",
            "sqs:SendMessage",
            "sqs:SendMessageBatch"
        ],
        "Resource": [
            queueArn
        ]
    })

    //Add exports if a dead letter queue was specified
    if (deadLetterQueueName) {
        let deadLetterQueueNameEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, 'DEAD_LETTER_QUEUE_NAME');
        deployContext.environmentVariables[deadLetterQueueNameEnv] = deadLetterQueueName;
        let deadLetterQueueArnEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, "DEAD_LETTER_QUEUE_ARN");
        deployContext.environmentVariables[deadLetterQueueArnEnv] = deadLetterQueueArn;
        let deadLetterQueueUrlEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, "DEAD_LETTER_QUEUE_URL");
        deployContext.environmentVariables[deadLetterQueueUrlEnv] = deadLetterQueueUrl;

        deployContext.eventOutputs.deadLetterQueueUrl = deadLetterQueueUrl;
        deployContext.eventOutputs.deadLetterQueueArn = deadLetterQueueArn;

        deployContext.policies[0].Resource.push(deadLetterQueueArn);
    }

    return deployContext;
}

function getPolicyStatementForSqsEventConsumption(queueArn, producerArn) {
    return {
        Effect: "Allow",
        Principal: "*",
        Action: "sqs:SendMessage",
        Resource: queueArn,
        Condition: {
            ArnEquals: {
                "aws:SourceArn": producerArn
            }
        }
    }
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext) {
    let errors = [];
    return errors;
}

exports.preDeploy = function (serviceContext) {
    return preDeployPhaseCommon.preDeployNotRequired(serviceContext, SERVICE_NAME);
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    return bindPhaseCommon.bindNotRequired(ownServiceContext, dependentOfServiceContext, SERVICE_NAME);
}


exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Executing Deploy on ${stackName}`);

    return getCompiledSqsTemplate(stackName, ownServiceContext)
        .then(sqsTemplate => {
            let stackTags = deployPhaseCommon.getTags(ownServiceContext);
            return deployPhaseCommon.deployCloudFormationStack(stackName, sqsTemplate, [], true, SERVICE_NAME, stackTags);
        })
        .then(deployedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying SQS queue ${stackName}`);
            return getDeployContext(ownServiceContext, deployedStack);
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return new Promise((resolve, reject) => {
        winston.info(`${SERVICE_NAME} - Consuming events from service '${producerServiceContext.serviceName}' for service '${ownServiceContext.serviceName}'`);
        let queueUrl = ownDeployContext.eventOutputs.queueUrl;
        let queueArn = ownDeployContext.eventOutputs.queueArn;
        let producerServiceType = producerServiceContext.serviceType;
        let producerArn;
        if (producerServiceType === 'sns') {
            producerArn = producerDeployContext.eventOutputs.topicArn;
        }
        else {
            return reject(new Error(`${SERVICE_NAME} - Unsupported event producer type given: ${producerServiceType}`));
        }

        let policyStatement = getPolicyStatementForSqsEventConsumption(queueArn, producerArn);

        //Add SQS permission
        return sqsCalls.addSqsPermissionIfNotExists(queueUrl, queueArn, producerArn, policyStatement)
            .then(permissionStatement => {
                winston.info(`${SERVICE_NAME} - Allowed consuming events from '${producerServiceContext.serviceName}' for '${ownServiceContext.serviceName}'`);
                return resolve(new ConsumeEventsContext(ownServiceContext, producerServiceContext));
            });
    });
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't produce events for other services`));
}

exports.unPreDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unPreDeployNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.unBind = function (ownServiceContext) {
    return deletePhasesCommon.unBindNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.unDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

exports.consumedDeployOutputTypes = [];
