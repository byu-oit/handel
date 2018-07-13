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
    DeployContext,
    PreDeployContext,
    ProduceEventsContext,
    ServiceConfig,
    ServiceContext,
    ServiceEventType,
    UnDeployContext
} from 'handel-extension-api';
import { awsCalls, deployPhase, handlebars, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import * as iotDeployersCommon from '../../common/iot-deployers-common';
import {IotServiceConfig, IotServiceEventConsumer} from './config-types';

const SERVICE_NAME = 'IOT';

function getDeployContext(stackName: string, ownServiceContext: ServiceContext<IotServiceConfig>) {
    const deployContext = new DeployContext(ownServiceContext);

    const ruleNamePrefix = iotDeployersCommon.getTopicRuleNamePrefix(ownServiceContext);
    const topicRuleArnPrefix = iotDeployersCommon.getTopicRuleArnPrefix(ruleNamePrefix, ownServiceContext.accountConfig); // This will be suffixed by the name of the consuming service (since there may be more than one)
    deployContext.eventOutputs = {
        resourceArn: topicRuleArnPrefix, // TODO - I don't like returning a prefix, but I'm not sure how to deal with this yet
        resourcePrincipal: 'iot.amazonaws.com',
        serviceEventType: ServiceEventType.IoT
    };

    return deployContext;
}

function getCompiledTopicRuleTemplate(description: string, ruleName: string, sql: string, ruleDisabled: boolean | undefined, actions: any) { // TODO - I can't find a type for the CF version of AWS.Iot.Action
    // Default to false for ruleDisabled if not specified
    if (ruleDisabled === null || ruleDisabled === undefined) {
        ruleDisabled = false;
    }

    const handlebarsParams = {
        description,
        ruleName,
        sql,
        ruleDisabled,
        actions
    };

    return handlebars.compileTemplate(`${__dirname}/iot-topic-rule-template.yml`, handlebarsParams);
}

function getStackNameFromRuleName(ruleName: string) {
    return ruleName.replace(/_/g, '-');
}

async function deleteTopicRule(ruleName: string) {
    winston.info(`${SERVICE_NAME} - Executing UnDeploy on topic rule '${ruleName}'`);

    const stackName = getStackNameFromRuleName(ruleName);
    const stack = await awsCalls.cloudFormation.getStack(stackName);
    if (stack) {
        winston.info(`${SERVICE_NAME} - Deleting stack '${stackName}'`);
        return awsCalls.cloudFormation.deleteStack(stackName);
    }
    else {
        winston.info(`${SERVICE_NAME} - Stack '${stackName}' has already been deleted`);
    }
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<IotServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>) {
    const errors = [];

    const serviceParams = serviceContext.params;
    if (serviceParams.event_consumers) {
        for (const eventConsumerConfig of serviceParams.event_consumers as IotServiceEventConsumer[]) {
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

export async function deploy(ownServiceContext: ServiceContext<IotServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    winston.debug(`${SERVICE_NAME} - Deploy not currently required for the IoT service`);
    const stackName = ownServiceContext.stackName();
    return getDeployContext(stackName, ownServiceContext); // Empty deploy
}

export async function produceEvents(ownServiceContext: ServiceContext<IotServiceConfig>, ownDeployContext: DeployContext, eventConsumerConfig: IotServiceEventConsumer, consumerServiceContext: ServiceContext<ServiceConfig>, consumerDeployContext: DeployContext): Promise<ProduceEventsContext> {
    winston.info(`${SERVICE_NAME} - Producing events from '${ownServiceContext.serviceName}' for consumer '${consumerServiceContext.serviceName}'`);
    if(!ownDeployContext.eventOutputs || !consumerDeployContext.eventOutputs) {
        throw new Error(`${SERVICE_NAME} - Both the consumer and producer must return event outputs from their deploy`);
    }

    // Create topic rule
    const consumerType = consumerServiceContext.serviceType;
    const ruleName = iotDeployersCommon.getTopicRuleName(ownServiceContext, eventConsumerConfig);
    const sql = eventConsumerConfig.sql;
    const ruleDisabled = eventConsumerConfig.rule_disabled;
    const actions = [];
    if (consumerDeployContext.eventOutputs.serviceEventType === ServiceEventType.Lambda) {
        actions.push({
            Lambda: {
                FunctionArn: consumerDeployContext.eventOutputs.resourceArn
            }
        });
    }
    else {
        throw new Error(`${SERVICE_NAME} - Unsupported event consumer type given: ${consumerType}`);
    }

    const stackTags = tagging.getTags(ownServiceContext);
    const serviceParams = ownServiceContext.params;
    const stackName = getStackNameFromRuleName(ruleName);
    const description = serviceParams.description || 'AWS IoT rule created by Handel for ' + stackName;
    const compiledTemplate = await getCompiledTopicRuleTemplate(description, ruleName, sql, ruleDisabled, actions);
    const deployedStack = await deployPhase.deployCloudFormationStack(ownServiceContext, stackName, compiledTemplate, [], true, 30, stackTags);
    winston.info(`${SERVICE_NAME} - Finished producing events from '${ownServiceContext.serviceName}' for consumer '${consumerServiceContext.serviceName}'`);
    return new ProduceEventsContext(ownServiceContext, consumerServiceContext);
}

export async function unDeploy(ownServiceContext: ServiceContext<ServiceConfig>): Promise<UnDeployContext> {
    winston.info(`${SERVICE_NAME} - Undeploying events production from '${ownServiceContext.serviceName}'`);
    const deletePromises = [];

    // Delete all topic rules created by produce events
    const serviceParams = ownServiceContext.params;
    if (serviceParams.event_consumers) {
        for (const eventConsumerConfig of serviceParams.event_consumers) {
            const ruleName = iotDeployersCommon.getTopicRuleName(ownServiceContext, eventConsumerConfig);
            winston.info(`${SERVICE_NAME} - Deleting topic rule '${ruleName}'`);
            deletePromises.push(deleteTopicRule(ruleName));
        }
    }

    return Promise.all(deletePromises)
        .then(() => {
            winston.info(`${SERVICE_NAME} - Finished undeploying events production from '${ownServiceContext.serviceName}'`);
            return new UnDeployContext(ownServiceContext);
        });
}

export const providedEventType = ServiceEventType.IoT;

export const producedEventsSupportedTypes = [
    ServiceEventType.Lambda
];

export const producedDeployOutputTypes = [];

export const consumedDeployOutputTypes = [];

export const supportsTagging = true;
