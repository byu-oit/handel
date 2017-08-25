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
const DeployContext = require('../../datatypes/deploy-context');
const UnDeployContext = require('../../datatypes/un-deploy-context');
const ProduceEventsContext = require('../../datatypes/produce-events-context');
const cloudWatchEventsCalls = require('../../aws/cloudwatch-events-calls');
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../common/bind-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const produceEventsPhaseCommon = require('../../common/produce-events-phase-common');
const handlebarsUtils = require('../../common/handlebars-utils');
const yaml = require('js-yaml');

const SERVICE_NAME = "CloudWatch Events";

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
    let description = serviceParams.description || 'Handel-created rule for ' + stackName;
    let state = serviceParams.state || 'enabled';
    let handlebarsParams = {
        description: description,
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

exports.check = function (serviceContext, dependenciesServiceContexts) {
    let errors = [];

    let serviceParams = serviceContext.params;

    //Require 'schedule' or 'event_pattern'
    if (!serviceParams.schedule && !serviceParams.event_pattern) {
        errors.push(`${SERVICE_NAME} - You must specify at least one of the 'schedule' or 'event_pattern' parameters`);
    }

    return errors;
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying event rule ${stackName}`);

    return getCompiledEventRuleTemplate(stackName, ownServiceContext)
        .then(eventRuleTemplate => {
            let stackTags = deployPhaseCommon.getTags(ownServiceContext)
            return deployPhaseCommon.deployCloudFormationStack(stackName, eventRuleTemplate, [], true, SERVICE_NAME, stackTags);
        })
        .then(deployedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying event rule ${stackName}`);
            return getDeployContext(ownServiceContext, deployedStack);
        });
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return new Promise((resolve, reject) => {
        winston.info(`${SERVICE_NAME} - Producing events from '${ownServiceContext.serviceName}' for consumer ${consumerServiceContext.serviceName}`);

        let ruleName = deployPhaseCommon.getResourceName(ownServiceContext);
        let consumerServiceType = consumerServiceContext.serviceType;
        let targetId = deployPhaseCommon.getResourceName(consumerServiceContext);
        let targetArn;
        let input;
        if (consumerServiceType === 'lambda') {
            targetArn = consumerDeployContext.eventOutputs.lambdaArn;
            let eventConsumerConfig = produceEventsPhaseCommon.getEventConsumerConfig(ownServiceContext, consumerServiceContext.serviceName);
            if (!eventConsumerConfig) { throw new Error(`No event_consumer config found in producer service for '${consumerServiceContext.serviceName}'`); }
            input = eventConsumerConfig.event_input;
        }
        else {
            return reject(new Error(`${SERVICE_NAME} - Unsupported event consumer type given: ${consumerServiceType}`));
        }

        cloudWatchEventsCalls.addTarget(ruleName, targetArn, targetId, input)
            .then(targetId => {
                winston.info(`${SERVICE_NAME} - Configured production of events from '${ownServiceContext.serviceName}' for consumer '${consumerServiceContext.serviceName}'`)
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
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Executing UnDeploy on Events Rule '${stackName}'`)


    return cloudWatchEventsCalls.getRule(stackName)
        .then(rule => {
            if (rule) {
                winston.info(`${SERVICE_NAME} - Removing targets from event rule '${stackName}'`);
                return cloudWatchEventsCalls.removeAllTargets(stackName)
            }
            else {
                winston.info(`${SERVICE_NAME} - Rule '${stackName}' has already been deleted`);
                return true;
            }
        })
        .then(success => {
            return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
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
