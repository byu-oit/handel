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
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const ConsumeEventsContext = require('../../datatypes/consume-events-context');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployersCommon = require('../../common/deployers-common');
const sqsCalls = require('../../aws/sqs-calls');

function getCompiledSqsTemplate(stackName, serviceContext) {
    let serviceParams = serviceContext.params;
    let handlebarsParams = {
        queueName: stackName,
        delaySeconds: 0,
        receiveMessageWaitTimeSeconds: 0,
        maxMessageSize: 262144,
        messageRetentionPeriod: 345600,
        visibilityTimeout: 30
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

    return handlebarsUtils.compileTemplate(`${__dirname}/sqs-template.yml`, handlebarsParams)
}

function getDeployContext(serviceContext, cfStack) {
    let queueName = cloudFormationCalls.getOutput('QueueName', cfStack);
    let queueArn = cloudFormationCalls.getOutput('QueueArn', cfStack);
    let queueUrl = cloudFormationCalls.getOutput('QueueUrl', cfStack);
    let deployContext = new DeployContext(serviceContext);

    //Env variables to inject into consuming services
    let queueNameEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'QUEUE_NAME');
    deployContext.environmentVariables[queueNameEnv] = queueName;
    let queueArnEnv = deployersCommon.getInjectedEnvVarName(serviceContext, "QUEUE_ARN");
    deployContext.environmentVariables[queueArnEnv] = queueArn;
    let queueUrlEnv = deployersCommon.getInjectedEnvVarName(serviceContext, "QUEUE_URL");
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
    winston.info(`SQS - PreDeploy is not required for this service, skipping it`);
    return Promise.resolve(new PreDeployContext(serviceContext));
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`SQS - Bind is not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`SQS - Executing Deploy on ${stackName}`);

    return getCompiledSqsTemplate(stackName, ownServiceContext)
        .then(sqsTemplate => {
            return cloudFormationCalls.getStack(stackName)
                .then(stack => {
                    if (!stack) {
                        winston.info(`SQS - Creating SQS queue ${stackName}`);
                        return cloudFormationCalls.createStack(stackName, sqsTemplate, []);
                    }
                    else {
                        winston.info(`SQS - Updating SQS queue ${stackName}`);
                        return cloudFormationCalls.updateStack(stackName, sqsTemplate, []);
                    }
                })
        })
        .then(deployedStack => {
            winston.info(`SQS - Finished deploying SQS queue ${stackName}`);
            return getDeployContext(ownServiceContext, deployedStack);
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return new Promise((resolve, reject) => {
        winston.info(`SQS - Consuming events from service '${producerServiceContext.serviceName}' for service '${ownServiceContext.serviceName}'`);
        let queueUrl = ownDeployContext.eventOutputs.queueUrl;
        let queueArn = ownDeployContext.eventOutputs.queueArn;
        let producerServiceType = producerServiceContext.serviceType;
        let producerArn;
        if (producerServiceType === 'sns') {
            producerArn = producerDeployContext.eventOutputs.topicArn;
        }
        else {
            return reject(new Error(`SQS - Unsupported event producer type given: ${producerServiceType}`));
        }

        let policyStatement = getPolicyStatementForSqsEventConsumption(queueArn, producerArn);

        //Add SQS permission
        return sqsCalls.addSqsPermissionIfNotExists(queueUrl, queueArn, producerArn, policyStatement)
            .then(permissionStatement => {
                winston.info(`SQS - Allowed consuming events from '${producerServiceContext.serviceName}' for '${ownServiceContext.serviceName}'`);
                return resolve(new ConsumeEventsContext(ownServiceContext, producerServiceContext));
            });
    });
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error("The SQS service doesn't produce events for other services"));
}

exports.unPreDeploy = function (ownServiceContext) {
    winston.info(`SQS - UnPreDeploy is not required for this service`);
    return Promise.resolve(new UnPreDeployContext(ownServiceContext));
}

exports.unBind = function (ownServiceContext) {
    winston.info(`SQS - UnBind is not required for this service`);
    return Promise.resolve(new UnBindContext(ownServiceContext));
}

exports.unDeploy = function (ownServiceContext) {
    return deployersCommon.unDeployCloudFormationStack(ownServiceContext, 'SQS');
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

exports.consumedDeployOutputTypes = [];
