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
const ProduceEventsContext = require('../../datatypes/produce-events-context');
const DeployContext = require('../../datatypes/deploy-context');
const snsCalls = require('../../aws/sns-calls');
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../common/bind-phase-common');

const SERVICE_NAME = "SNS";

function getCompiledSnsTemplate(stackName, serviceContext) {
    let handlebarsParams = {
        subscriptions: serviceContext.params.subscriptions,
        topicName: stackName
    };
    return handlebarsUtils.compileTemplate(`${__dirname}/sns-template.yml`, handlebarsParams)
}

function getDeployContext(serviceContext, cfStack) {
    let topicName = cloudFormationCalls.getOutput('TopicName', cfStack);
    let topicArn = cloudFormationCalls.getOutput('TopicArn', cfStack);
    let deployContext = new DeployContext(serviceContext);

    //Event outputs for consumers of SNS events
    deployContext.eventOutputs.topicArn = topicArn;
    deployContext.eventOutputs.principal = "sns.amazonaws.com";

    //Env variables to inject into consuming services
    let topicArnEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, 'TOPIC_ARN');
    deployContext.environmentVariables[topicArnEnv] = topicArn;
    let topicNameEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, "TOPIC_NAME");
    deployContext.environmentVariables[topicNameEnv] = topicName;

    //Policy to talk to this queue
    deployContext.policies.push({
        "Effect": "Allow",
        "Action": [
            "sns:ConfirmSubscription",
            "sns:GetEndpointAttributes",
            "sns:GetPlatformApplicationAttributes",
            "sns:GetSMSAttributes",
            "sns:GetSubscriptionAttributes",
            "sns:GetTopicAttributes",
            "sns:ListEndpointsByPlatformApplication",
            "sns:ListPhoneNumbersOptedOut",
            "sns:ListSubscriptions",
            "sns:ListSubscriptionsByTopic",
            "sns:ListTopics",
            "sns:OptInPhoneNumber",
            "sns:Publish",
            "sns:Subscribe",
            "sns:Unsubscribe"
        ],
        "Resource": [
            topicArn
        ]
    })

    return deployContext;
}


/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext) {
    let errors = [];

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

exports.preDeploy = function (serviceContext) {
    return preDeployPhaseCommon.preDeployNotRequired(serviceContext, SERVICE_NAME);
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    return bindPhaseCommon.bindNotRequired(ownServiceContext, dependentOfServiceContext, SERVICE_NAME);
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Executing Deploy on ${stackName}`);

    return getCompiledSnsTemplate(stackName, ownServiceContext)
        .then(compiledSnsTemplate => {
            let stackTags = deployPhaseCommon.getTags(ownServiceContext);
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledSnsTemplate, [], true, SERVICE_NAME, stackTags);
        })
        .then(deployedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying SNS topic ${stackName}`);
            return getDeployContext(ownServiceContext, deployedStack);
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't consume events from other services`));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return new Promise((resolve, reject) => {
        winston.info(`${SERVICE_NAME} - Producing events from ${ownServiceContext.serviceName} for consumer ${consumerServiceContext.serviceName}`);
        //Add subscription to sns service
        let topicArn = ownDeployContext.eventOutputs.topicArn;
        let consumerServiceType = consumerServiceContext.serviceType;
        let protocol;
        let endpoint;
        if (consumerServiceType === 'lambda') {
            protocol = 'lambda';
            endpoint = consumerDeployContext.eventOutputs.lambdaArn;
        }
        else if (consumerServiceType === 'sqs') {
            protocol = 'sqs';
            endpoint = consumerDeployContext.eventOutputs.queueArn;
        }
        else {
            return reject(new Error(`${SERVICE_NAME} - Unsupported event consumer type given: ${consumerServiceType}`));
        }

        return snsCalls.subscribeToTopic(topicArn, protocol, endpoint)
            .then(subscriptionArn => {
                winston.info(`${SERVICE_NAME} - Configured production of events from ${ownServiceContext.serviceName} for consumer ${consumerServiceContext.serviceName}`);
                return resolve(new ProduceEventsContext(ownServiceContext, consumerServiceContext));
            });
    });
}

exports.unPreDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unPreDeployNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.unBind = function (ownServiceContext) {
    return deletePhasesCommon.unBindNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.unDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unDeployCloudFormationStack(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [
    'lambda',
    'sqs'
];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

exports.consumedDeployOutputTypes = [];
