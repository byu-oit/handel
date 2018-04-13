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
import { IDeployContext, isConsumeEventsContext } from 'handel-extension-api';
import {ServiceRegistry} from 'handel-extension-api';
import * as winston from 'winston';
import * as util from '../common/util';
import {
    ConsumeEventsContexts,
    DeployContexts,
    DontBlameHandelError,
    EnvironmentContext,
    ServiceConfig,
    ServiceContext,
    ServiceDeployer
} from '../datatypes';

interface ConsumeEventAction {
    consumerServiceContext: ServiceContext<ServiceConfig>;
    consumerDeployContext: IDeployContext;
    consumerServiceDeployer: ServiceDeployer;
    producerServiceContext: ServiceContext<ServiceConfig>;
    producerDeployContext: IDeployContext;
}

export async function consumeEvents(serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext, deployContexts: DeployContexts) {
    winston.info(`Executing consume events phase on services in environment ${environmentContext.environmentName}`);

    const consumeEventActions: ConsumeEventAction[] = [];
    const consumeEventsContexts: ConsumeEventsContexts = {};

    for (const producerServiceName in environmentContext.serviceContexts) {
        if (environmentContext.serviceContexts.hasOwnProperty(producerServiceName)) {
            const producerServiceContext = environmentContext.serviceContexts[producerServiceName];
            if (producerServiceContext.params.event_consumers) { // Only look at those services producing events
                for(const eventConsumerConfig of producerServiceContext.params.event_consumers) {
                    const producerDeployContext = deployContexts[producerServiceName];

                    const consumerServiceName = eventConsumerConfig.service_name;
                    const consumerServiceContext = environmentContext.serviceContexts[consumerServiceName];
                    const consumerDeployContext = deployContexts[consumerServiceName];
                    const consumerServiceDeployer = serviceRegistry.getService(consumerServiceContext.serviceType);

                    const consumeEventsContextName = util.getConsumeEventsContextName(consumerServiceContext.serviceName, producerServiceContext.serviceName);
                    winston.debug(`Consuming events from service ${consumeEventsContextName}`);
                    if (!consumerServiceDeployer.consumeEvents) {
                        throw new Error(`Tried to invoke the 'consumeEvents' phase on the '${consumerServiceContext.serviceType}' service, but it does not implement it`);
                    }

                    const consumeEventsContext = await consumerServiceDeployer.consumeEvents(consumerServiceContext, consumerDeployContext, producerServiceContext, producerDeployContext);
                    if (!isConsumeEventsContext(consumeEventsContext)) {
                        throw new DontBlameHandelError('Expected ConsumeEventsContext back from \'consumeEvents\' phase of service deployer', consumerServiceContext.serviceType);
                    }

                    consumeEventsContexts[consumeEventsContextName] = consumeEventsContext;
                }
            }
        }
    }

    return consumeEventsContexts; // This was built-up dynamically above
}
