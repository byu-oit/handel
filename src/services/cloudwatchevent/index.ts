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
import * as yaml from 'js-yaml';
import * as winston from 'winston';
import * as cloudFormationCalls from '../../aws/cloudformation-calls';
import * as cloudWatchEventsCalls from '../../aws/cloudwatch-events-calls';
import * as deletePhasesCommon from '../../common/delete-phases-common';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as handlebarsUtils from '../../common/handlebars-utils';
import * as produceEventsPhaseCommon from '../../common/produce-events-phase-common';
import { AccountConfig, DeployContext, PreDeployContext, ProduceEventsContext, ServiceConfig, ServiceContext, ServiceEventConsumer, UnDeployContext } from '../../datatypes';
import { CloudWatchEventsConfig, CloudWatchEventsServiceEventConsumer } from './config-types';

const SERVICE_NAME = 'CloudWatch Events';

function getDeployContext(serviceContext: ServiceContext<CloudWatchEventsConfig>, deployedStack: AWS.CloudFormation.Stack): DeployContext {
    const deployContext = new DeployContext(serviceContext);

    // Event outputs for consumers of CloudWatch events
    const eventRuleArn = cloudFormationCalls.getOutput('EventRuleArn', deployedStack);
    deployContext.eventOutputs.eventRuleArn = eventRuleArn;
    deployContext.eventOutputs.principal = 'events.amazonaws.com';

    return deployContext;
}

async function getCompiledEventRuleTemplate(stackName: string, serviceContext: ServiceContext<CloudWatchEventsConfig>): Promise<string> {
    const serviceParams = serviceContext.params;
    const description = serviceParams.description || 'Handel-created rule for ' + stackName;
    const state = serviceParams.state || 'enabled';
    const handlebarsParams: any = {
        description: description,
        ruleName: stackName,
        state: state.toUpperCase()
    };
    if (serviceParams.schedule) {
        handlebarsParams.scheduleExpression = serviceParams.schedule;
    }
    const template = await handlebarsUtils.compileTemplate(`${__dirname}/event-rule-template.yml`, handlebarsParams);
    // NOTE: This is a bit odd, but the syntax of event patterns is complex enough that it's easiest to just provide
    //  a pass-through to the AWS event rule syntax for anyone wanting to specify an event pattern.
    const templateObj = yaml.safeLoad(template);
    if (serviceParams.event_pattern) {
        templateObj.Resources.EventsRule.Properties.EventPattern = serviceParams.event_pattern;
    }
    const templateStr = yaml.safeDump(templateObj);
    return templateStr;
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<CloudWatchEventsConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors: string[] = [];

    const serviceParams = serviceContext.params;

    // Require 'schedule' or 'event_pattern'
    if (!serviceParams.schedule && !serviceParams.event_pattern) {
        errors.push(`${SERVICE_NAME} - You must specify at least one of the 'schedule' or 'event_pattern' parameters`);
    }

    return errors;
}

export async function deploy(ownServiceContext: ServiceContext<CloudWatchEventsConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying event rule ${stackName}`);

    const eventRuleTemplate = await getCompiledEventRuleTemplate(stackName, ownServiceContext);
    const stackTags = deployPhaseCommon.getTags(ownServiceContext);
    const deployedStack = await deployPhaseCommon.deployCloudFormationStack(stackName, eventRuleTemplate, [], true, SERVICE_NAME, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying event rule ${stackName}`);
    return getDeployContext(ownServiceContext, deployedStack);
}

export async function produceEvents(ownServiceContext: ServiceContext<CloudWatchEventsConfig>, ownDeployContext: DeployContext, consumerServiceContext: ServiceContext<ServiceConfig>, consumerDeployContext: DeployContext) {
    winston.info(`${SERVICE_NAME} - Producing events from '${ownServiceContext.serviceName}' for consumer ${consumerServiceContext.serviceName}`);

    const ruleName = deployPhaseCommon.getResourceName(ownServiceContext);
    const consumerServiceType = consumerServiceContext.serviceType;
    const targetId = deployPhaseCommon.getResourceName(consumerServiceContext);
    let targetArn;
    let input;
    if (consumerServiceType === 'lambda') {
        targetArn = consumerDeployContext.eventOutputs.lambdaArn;
        const eventConsumerConfig = produceEventsPhaseCommon.getEventConsumerConfig(ownServiceContext, consumerServiceContext.serviceName) as CloudWatchEventsServiceEventConsumer;
        if (!eventConsumerConfig) { throw new Error(`No event_consumer config found in producer service for '${consumerServiceContext.serviceName}'`); }
        input = eventConsumerConfig.event_input;
    }
    else if (consumerServiceType === 'sns') {
        targetArn = consumerDeployContext.eventOutputs.topicArn;
        const eventConsumerConfig = produceEventsPhaseCommon.getEventConsumerConfig(ownServiceContext, consumerServiceContext.serviceName) as CloudWatchEventsServiceEventConsumer;
        if (!eventConsumerConfig) { throw new Error(`No event_consumer config found in producer service for '${consumerServiceContext.serviceName}'`); }
        input = eventConsumerConfig.event_input;
    }
    else {
        throw new Error(`${SERVICE_NAME} - Unsupported event consumer type given: ${consumerServiceType}`);
    }

    const retTargetId = await cloudWatchEventsCalls.addTarget(ruleName, targetArn, targetId, input);
    winston.info(`${SERVICE_NAME} - Configured production of events from '${ownServiceContext.serviceName}' for consumer '${consumerServiceContext.serviceName}'`);
    return new ProduceEventsContext(ownServiceContext, consumerServiceContext);
}

export async function unDeploy(ownServiceContext: ServiceContext<CloudWatchEventsConfig>): Promise<UnDeployContext> {
    const stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Executing UnDeploy on Events Rule '${stackName}'`);

    const rule = await cloudWatchEventsCalls.getRule(stackName);
    let success = true;
    if (rule) {
        winston.info(`${SERVICE_NAME} - Removing targets from event rule '${stackName}'`);
        success = await cloudWatchEventsCalls.removeAllTargets(stackName);
    }
    else {
        winston.info(`${SERVICE_NAME} - Rule '${stackName}' has already been deleted`);
    }
    await deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
    return new UnDeployContext(ownServiceContext);
}

export const producedEventsSupportedServices = [
    'lambda',
    'sns'
];

export const producedDeployOutputTypes = [];

export const consumedDeployOutputTypes = [];
