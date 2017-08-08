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
const UnDeployContext = require('../../datatypes/un-deploy-context');
const ProduceEventsContext = require('../../datatypes/produce-events-context');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../common/bind-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const produceEventsPhaseCommon = require('../../common/produce-events-phase-common');
const iotDeployersCommon = require('../../common/iot-deployers-common');
const cloudformationCalls = require('../../aws/cloudformation-calls');

const SERVICE_NAME = "IOT";

function getDeployContext(stackName, ownServiceContext) {
    let deployContext = new DeployContext(ownServiceContext);

    let ruleNamePrefix = iotDeployersCommon.getTopicRuleNamePrefix(ownServiceContext);
    deployContext.eventOutputs.topicRuleArnPrefix = iotDeployersCommon.getTopicRuleArnPrefix(ruleNamePrefix); //This will be suffixed by the name of the consuming service (since there may be more than one)
    deployContext.eventOutputs.principal = "iot.amazonaws.com";

    return deployContext;
}

function getCompiledTopicRuleTemplate(description, ruleName, sql, ruleDisabled, actions) {
    //Default to false for ruleDisabled if not specified
    if (ruleDisabled === null || ruleDisabled === undefined) {
        ruleDisabled = false;
    }

    let handlebarsParams = {
        description,
        ruleName,
        sql,
        ruleDisabled,
        actions
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/iot-topic-rule-template.yml`, handlebarsParams);
}

function getStackNameFromRuleName(ruleName) {
    return ruleName.replace(/_/g, "-");
}

function deleteTopicRule(ruleName) {
    winston.info(`${SERVICE_NAME} - Executing UnDeploy on topic rule '${ruleName}'`)

    let stackName = getStackNameFromRuleName(ruleName);
    return cloudformationCalls.getStack(stackName)
        .then(stack => {
            if (stack) {
                winston.info(`${SERVICE_NAME} - Deleting stack '${stackName}'`);
                return cloudformationCalls.deleteStack(stackName);
            }
            else {
                winston.info(`${SERVICE_NAME} - Stack '${stackName}' has already been deleted`);
            }
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
    if (serviceParams.event_consumers) {
        for (let eventConsumerConfig of serviceParams.event_consumers) {
            if (!eventConsumerConfig.service_name) {
                errors.push(`${SERVICE_NAME} - The 'service_name' parameter is required in each config in the 'event_consumers' section`);
            }
            if (!eventConsumerConfig.sql) {
                errors.push(`${SERVICE_NAME} - The 'sql' parameter is required in each config in the 'event_consumers' section`);
            }
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
    winston.info(`${SERVICE_NAME} - Deploy not currently required for the IoT service`);
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    return Promise.resolve(getDeployContext(stackName, ownServiceContext)); //Empty deploy
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't consume events from other services`));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return new Promise((resolve, reject) => {
        winston.info(`${SERVICE_NAME} - Producing events from '${ownServiceContext.serviceName}' for consumer '${consumerServiceContext.serviceName}'`);

        //Create topic rule 
        let eventConsumerConfig = produceEventsPhaseCommon.getEventConsumerConfig(ownServiceContext, consumerServiceContext.serviceName);
        let consumerServiceType = consumerServiceContext.serviceType;
        let ruleName = iotDeployersCommon.getTopicRuleName(ownServiceContext, eventConsumerConfig);
        let sql = eventConsumerConfig.sql;
        let ruleDisabled = eventConsumerConfig.rule_disabled;
        let actions = [];
        if (consumerServiceType === 'lambda') {
            actions.push({
                Lambda: {
                    FunctionArn: consumerDeployContext.eventOutputs.lambdaArn
                }
            });
        }
        else {
            return reject(new Error(`${SERVICE_NAME} - Unsupported event consumer type given: ${consumerServiceType}`));
        }

        let stackTags = deployPhaseCommon.getTags(ownServiceContext);
        let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
        let serviceParams = ownServiceContext.params;
        let description = serviceParams.description || 'AWS IoT rule created by Handel for ' + stackName;
        return getCompiledTopicRuleTemplate(description, ruleName, sql, ruleDisabled, actions)
            .then(compiledTemplate => {
                let stackName = getStackNameFromRuleName(ruleName);
                return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME, stackTags)
            })
            .then(deployedStack => {
                return resolve(new ProduceEventsContext(ownServiceContext, consumerServiceContext));
            })
    });
}

exports.unPreDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unPreDeployNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.unBind = function (ownServiceContext) {
    return deletePhasesCommon.unBindNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.unDeploy = function (ownServiceContext) {
    let deletePromises = [];

    //Delete all topic rules created by produce events
    let serviceParams = ownServiceContext.params;
    if (serviceParams.event_consumers) {
        for (let eventConsumerConfig of serviceParams.event_consumers) {
            let ruleName = iotDeployersCommon.getTopicRuleName(ownServiceContext, eventConsumerConfig);
            winston.info(`${SERVICE_NAME} - Deleting topic rule '${ruleName}'`);
            deletePromises.push(deleteTopicRule(ruleName));
        }
    }

    return Promise.all(deletePromises)
        .then(() => {
            return new UnDeployContext(ownServiceContext);
        });
}

exports.producedEventsSupportedServices = [
    'lambda'
];

exports.producedDeployOutputTypes = [];

exports.consumedDeployOutputTypes = [];
