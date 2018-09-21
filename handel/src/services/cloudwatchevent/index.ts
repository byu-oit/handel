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
    ServiceDeployer,
    ServiceEventType,
    UnDeployContext
} from 'handel-extension-api';
import { awsCalls, checkPhase, deletePhases, deployPhase, handlebars, tagging } from 'handel-extension-support';
import * as yaml from 'js-yaml';
import * as winston from 'winston';
import * as cloudWatchEventsCalls from '../../aws/cloudwatch-events-calls';
import {CloudWatchEventsConfig, CloudWatchEventsServiceEventConsumer} from './config-types';

const SERVICE_NAME = 'CloudWatch Events';

function getDeployContext(serviceContext: ServiceContext<CloudWatchEventsConfig>, deployedStack: AWS.CloudFormation.Stack): DeployContext {
    const deployContext = new DeployContext(serviceContext);

    // Event outputs for consumers of CloudWatch events
    const eventRuleArn = awsCalls.cloudFormation.getOutput('EventRuleArn', deployedStack);
    if(!eventRuleArn) {
        throw new Error('Should have returned an Event Rule ARN from the deployed stack');
    }
    deployContext.eventOutputs = {
        resourceArn: eventRuleArn,
        resourcePrincipal: 'events.amazonaws.com',
        serviceEventType: ServiceEventType.CloudWatchEvents
    };

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
    const template = await handlebars.compileTemplate(`${__dirname}/event-rule-template.yml`, handlebarsParams);
    // NOTE: This is a bit odd, but the syntax of event patterns is complex enough that it's easiest to just provide
    //  a pass-through to the AWS event rule syntax for anyone wanting to specify an event pattern.
    const templateObj = yaml.safeLoad(template) as any;
    if (serviceParams.event_pattern) {
        templateObj.Resources.EventsRule.Properties.EventPattern = serviceParams.event_pattern;
    }
    const templateStr = yaml.safeDump(templateObj);
    return templateStr;
}

export class Service implements ServiceDeployer {
    public readonly producedDeployOutputTypes = [];
    public readonly consumedDeployOutputTypes = [];
    public readonly providedEventType = ServiceEventType.CloudWatchEvents;
    public readonly producedEventsSupportedTypes = [
        ServiceEventType.Lambda,
        ServiceEventType.SNS
    ];
    public readonly supportsTagging = true;

    public check(serviceContext: ServiceContext<CloudWatchEventsConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
        const errors: string[] = checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
        if(errors.length === 0) {
            const serviceParams = serviceContext.params;
            if (!serviceParams.schedule && !serviceParams.event_pattern) {
                errors.push(`You must specify at least one of the 'schedule' or 'event_pattern' parameters`);
            }
        }
        return errors.map(error => `${SERVICE_NAME} - ${error}`);
    }

    public async deploy(ownServiceContext: ServiceContext<CloudWatchEventsConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
        const stackName = ownServiceContext.stackName();
        winston.info(`${SERVICE_NAME} - Deploying event rule ${stackName}`);

        const eventRuleTemplate = await getCompiledEventRuleTemplate(stackName, ownServiceContext);
        const stackTags = tagging.getTags(ownServiceContext);
        const deployedStack = await deployPhase.deployCloudFormationStack(ownServiceContext, stackName, eventRuleTemplate, [], true, 30, stackTags);
        winston.info(`${SERVICE_NAME} - Finished deploying event rule ${stackName}`);
        return getDeployContext(ownServiceContext, deployedStack);
    }

    public async produceEvents(ownServiceContext: ServiceContext<CloudWatchEventsConfig>, ownDeployContext: DeployContext, eventConsumerConfig: CloudWatchEventsServiceEventConsumer, consumerServiceContext: ServiceContext<ServiceConfig>, consumerDeployContext: DeployContext) {
        winston.info(`${SERVICE_NAME} - Producing events from '${ownServiceContext.serviceName}' for consumer ${consumerServiceContext.serviceName}`);
        if(!ownDeployContext.eventOutputs || !consumerDeployContext.eventOutputs) {
            throw new Error(`${SERVICE_NAME} - Both the consumer and producer must return event outputs from their deploy`);
        }

        const ruleName = ownServiceContext.stackName();
        const targetId = consumerServiceContext.stackName();
        const targetArn = consumerDeployContext.eventOutputs.resourceArn;
        if(!targetArn) {
            throw new Error(`${SERVICE_NAME} - Consumed service did not return an ARN`);
        }
        const input = eventConsumerConfig.event_input;

        const retTargetId = await cloudWatchEventsCalls.addTarget(ruleName, targetArn, targetId, input);
        winston.info(`${SERVICE_NAME} - Configured production of events from '${ownServiceContext.serviceName}' for consumer '${consumerServiceContext.serviceName}'`);
        return new ProduceEventsContext(ownServiceContext, consumerServiceContext);
    }

    public async unDeploy(ownServiceContext: ServiceContext<CloudWatchEventsConfig>): Promise<UnDeployContext> {
        const stackName = ownServiceContext.stackName();
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
        await deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
        return new UnDeployContext(ownServiceContext);
    }
}
