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
import { DeployContext, PreDeployContext, ProduceEventsContext, ServiceConfig, ServiceContext, ServiceDeployer, ServiceEventConsumer, ServiceEventType } from 'handel-extension-api';
import * as winston from 'winston';

const SERVICE_NAME = 'Alexa Skill Kit';

function getDeployContext(ownServiceContext: ServiceContext<ServiceConfig>): DeployContext {
    const deployContext = new DeployContext(ownServiceContext);
    deployContext.eventOutputs = {
        resourcePrincipal: 'alexa-appkit.amazon.com',
        serviceEventType: ServiceEventType.AlexaSkillKit
    };
    return deployContext;
}

export class Service implements ServiceDeployer {
    public readonly producedDeployOutputTypes = [];
    public readonly consumedDeployOutputTypes = [];
    public readonly providedEventType = ServiceEventType.AlexaSkillKit;
    public readonly producedEventsSupportedTypes = [
        ServiceEventType.Lambda
    ];
    public readonly supportsTagging = false;

    public check(serviceContext: ServiceContext<ServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
        return [];
    }

    public async deploy(ownServiceContext: ServiceContext<ServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
        winston.debug(`${SERVICE_NAME} - Deploy not currently required for the Alexa Skill Kit service`);
        return getDeployContext(ownServiceContext);
    }

    public async produceEvents(ownServiceContext: ServiceContext<ServiceConfig>, ownDeployContext: DeployContext, eventConsumerConfig: ServiceEventConsumer, consumerServiceContext: ServiceContext<ServiceConfig>, consumerDeployContext: DeployContext): Promise<ProduceEventsContext> {
        winston.info(`${SERVICE_NAME} - No events to produce from '${ownServiceContext.serviceName}' for consumer ${consumerServiceContext.serviceName}`);
        return new ProduceEventsContext(ownServiceContext, consumerServiceContext);
    }
}
