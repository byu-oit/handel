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
import { IDeployContext, isProduceEventsContext, ServiceRegistry} from 'handel-extension-api';
import * as winston from 'winston';
import * as util from '../common/util';
import {
    DeployContexts,
    DontBlameHandelError,
    EnvironmentContext,
    ProduceEventsContexts,
    ServiceConfig,
    ServiceContext,
    ServiceDeployer,
    ServiceEventConsumer
} from '../datatypes';

interface ProduceEventsAction {
    eventConsumerConfig: ServiceEventConsumer;
    producerServiceContext: ServiceContext<ServiceConfig>;
    producerDeployContext: IDeployContext;
    producerServiceDeployer: ServiceDeployer;
}

async function produceEvent(consumerServiceContext: ServiceContext<ServiceConfig>, eventConsumerConfig: ServiceEventConsumer, consumerDeployContext: IDeployContext, producerServiceContext: ServiceContext<ServiceConfig>, producerDeployContext: IDeployContext, producerServiceDeployer: ServiceDeployer) {
    if (!producerServiceDeployer.produceEvents) {
        throw new Error(`Tried to execute 'produceEvents' phase in '${producerServiceContext.serviceType}', which doesn't implement that phase`);
    }
    winston.debug(`Producing events from ${producerServiceContext.serviceName} for service ${consumerServiceContext.serviceName}`);
    const produceEventsContext = await producerServiceDeployer.produceEvents(producerServiceContext, producerDeployContext, eventConsumerConfig, consumerServiceContext, consumerDeployContext);
    if (!isProduceEventsContext(produceEventsContext)) {
        throw new DontBlameHandelError(`Expected ProduceEventsContext back from 'produceEvents' phase of service deployer`, consumerServiceContext.serviceType);
    }
    return produceEventsContext;
}

export async function produceEvents(serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext, deployContexts: DeployContexts): Promise<ProduceEventsContexts> {
    winston.info(`Executing produce events phase on services in environment ${environmentContext.environmentName}`);

    const produceEventActions: ProduceEventsAction[] = [];
    const produceEventsContexts: ProduceEventsContexts = {};

    for (const producerServiceName in environmentContext.serviceContexts) {
        if (environmentContext.serviceContexts.hasOwnProperty(producerServiceName)) {
            const producerServiceContext = environmentContext.serviceContexts[producerServiceName];
            // _.forEach(environmentContext.serviceContexts, function (producerServiceContext, producerServiceName) {
            if (producerServiceContext.params.event_consumers) {
                // Get deploy info for producer service
                const producerServiceDeployer = serviceRegistry.getService(producerServiceContext.serviceType);
                const producerDeployContext = deployContexts[producerServiceName];

                // Run produce events for each service this service produces to
                for(const eventConsumerConfig of producerServiceContext.params.event_consumers) {
                    const consumerServiceName = eventConsumerConfig.service_name;
                    const produceEventsContextName = util.getProduceEventsContextName(producerServiceContext.serviceName, consumerServiceName);

                    const consumerServiceContext = environmentContext.serviceContexts[consumerServiceName];
                    const consumerDeployContext = deployContexts[consumerServiceName];

                    const produceEventsContext = await produceEvent(consumerServiceContext, eventConsumerConfig, consumerDeployContext, producerServiceContext, producerDeployContext, producerServiceDeployer);
                    produceEventsContexts[produceEventsContextName] = produceEventsContext;
                }
            }
        }
    }

    return produceEventsContexts; // This was built-up dynamically above
}
