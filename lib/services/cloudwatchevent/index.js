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
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const UnDeployContext = require('../../datatypes/un-deploy-context');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const ProduceEventsContext = require('../../datatypes/produce-events-context');
const cloudWatchEventsCalls = require('../../aws/cloudwatch-events-calls');
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployersCommon = require('../../common/deployers-common');
const handlebarsUtils = require('../../common/handlebars-utils');
const yaml = require('js-yaml');

function getDeployContext(serviceContext, deployedStack) {
    let deployContext = new DeployContext(serviceContext);

    //Event outputs for consumers of CloudWatch events
    let eventRuleArn = cloudFormationCalls.getOutput('EventRuleArn', deployedStack);
    deployContext.eventOutputs.eventRuleArn = eventRuleArn;
    deployContext.eventOutputs.principal = "events.amazonaws.com";

    return deployContext;
}

function getCompiledEventRuleTemplate(stackName, serviceContext) {
    let serviceParams = serviceContext.params;
    let state = serviceParams.state || 'enabled';
    let handlebarsParams = {
        ruleName: stackName,
        state: state.toUpperCase()
    }
    if (serviceParams.schedule) {
        handlebarsParams.scheduleExpression = serviceParams.schedule;
    }
    return handlebarsUtils.compileTemplate(`${__dirname}/event-rule-template.yml`, handlebarsParams)
        .then(template => {
            //NOTE: This is a bit odd, but the syntax of event patterns is complex enough that it's easiest to just provide
            //  a pass-through to the AWS event rule syntax for anyone wanting to specify an event pattern.
            let templateObj = yaml.safeLoad(template);
            if (serviceParams.event_pattern) {
                templateObj.Resources.EventsRule.Properties.EventPattern = serviceParams.event_pattern;
            }
            let templateStr = yaml.safeDump(templateObj);
            return templateStr;
        });
}


/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext) {
    let errors = [];

    let serviceParams = serviceContext.params;

    //Require 'schedule' or 'event_pattern'
    if (!serviceParams.schedule && !serviceParams.event_pattern) {
        errors.push(`CloudWatch Events - You must specify at least one of the 'schedule' or 'event_pattern' parameters`);
    }

    return errors;
}

exports.preDeploy = function (serviceContext) {
    winston.info(`CloudWatch Events - PreDeploy is not required for this service, skipping it`);
    return Promise.resolve(new PreDeployContext(serviceContext));
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`CloudWatch Events - Bind is not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`CloudWatch Events - Deploying CloudWatch Events Rule ${stackName}`);

    return getCompiledEventRuleTemplate(stackName, ownServiceContext)
        .then(eventRuleTemplate => {
            return deployersCommon.deployCloudFormationStack(stackName, eventRuleTemplate, [], true, "CloudWatch Events");
        })
        .then(deployedStack => {
            winston.info(`CloudWatchEvents - Finished deploying CloudWatch Events Rule ${stackName}`);
            return getDeployContext(ownServiceContext, deployedStack);
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error("The CloudWatch Events service doesn't consume events from other services"));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return new Promise((resolve, reject) => {
        winston.info(`CloudWatch Events - Producing events from '${ownServiceContext.serviceName}' for consumer ${consumerServiceContext.serviceName}`);

        let ruleName = deployersCommon.getResourceName(ownServiceContext);
        let consumerServiceType = consumerServiceContext.serviceType;
        let targetId = deployersCommon.getResourceName(consumerServiceContext);
        let targetArn;
        let input;
        if (consumerServiceType === 'lambda') {
            targetArn = consumerDeployContext.eventOutputs.lambdaArn;
            let eventConsumerConfig = deployersCommon.getEventConsumerConfigParams(ownServiceContext, consumerServiceContext);
            if (!eventConsumerConfig) { throw new Error(`No event_consumer config found in producer service for '${consumerServiceContext.serviceName}'`); }
            input = eventConsumerConfig.event_input;
        }
        else {
            return reject(new Error(`CloudWatch Events - Unsupported event consumer type given: ${consumerServiceType}`));
        }

        cloudWatchEventsCalls.addTarget(ruleName, targetArn, targetId, input)
            .then(targetId => {
                winston.info(`CloudWatch Events - Configured production of events from '${ownServiceContext.serviceName}' for consumer '${consumerServiceContext.serviceName}'`)
                return resolve(new ProduceEventsContext(ownServiceContext, consumerServiceContext));
            });
    });
}

exports.unPreDeploy = function (ownServiceContext) {
    winston.info(`CloudWatch Events - UnPreDeploy is not required for this service`);
    return Promise.resolve(new UnPreDeployContext(ownServiceContext));
}

exports.unBind = function (ownServiceContext) {
    winston.info(`CloudWatch Events - UnBind is not required for this service`);
    return Promise.resolve(new UnBindContext(ownServiceContext));
}

exports.unDeploy = function (ownServiceContext) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`CloudWatch Events - Executing UnDeploy on Events Rule '${stackName}'`)


    return cloudWatchEventsCalls.getRule(stackName)
        .then(rule => {
            if (rule) {
                winston.info(`CloudWatch Events - Removing targets from event rule '${stackName}'`);
                return cloudWatchEventsCalls.removeAllTargets(stackName)
            }
            else {
                winston.info(`CloudWatch Events - Rule '${stackName}' has already been deleted`);
                return true;
            }
        })
        .then(success => {
            return cloudFormationCalls.getStack(stackName)
                .then(stack => {
                    if (stack) {
                        winston.info(`CloudWatch Events - Deleting events rule stack '${stackName}'`);
                        return cloudFormationCalls.deleteStack(stackName);
                    }
                    else {
                        winston.info(`CloudWatch Events - Stack '${stackName}' has already been deleted`);
                    }
                });
        })
        .then(() => {
            return new UnDeployContext(ownServiceContext);
        });
}

exports.producedEventsSupportedServices = [
    'lambda'
];

exports.producedDeployOutputTypes = [];

exports.consumedDeployOutputTypes = [];
