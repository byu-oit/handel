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
import * as winston from 'winston';
import { DeployContext, PreDeployContext, ProduceEventsContext, ServiceConfig, ServiceContext } from '../../datatypes';

const SERVICE_NAME = 'Alexa Skill Kit';

function getDeployContext(ownServiceContext: ServiceContext<ServiceConfig>): DeployContext {
    const deployContext = new DeployContext(ownServiceContext);
    deployContext.eventOutputs.principal = 'alexa-appkit.amazon.com';
    return deployContext;
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<ServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    return [];
}

export function deploy(ownServiceContext: ServiceContext<ServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]) {
    winston.debug(`${SERVICE_NAME} - Deploy not currently required for the Alexa Skill Kit service`);
    return Promise.resolve(getDeployContext(ownServiceContext));
}

export function produceEvents(ownServiceContext: ServiceContext<ServiceConfig>, ownDeployContext: DeployContext, consumerServiceContext: ServiceContext<ServiceConfig>, consumerDeployContext: DeployContext) {
    winston.info(`${SERVICE_NAME} - No events to produce from '${ownServiceContext.serviceName}' for consumer ${consumerServiceContext.serviceName}`);
    return Promise.resolve(new ProduceEventsContext(ownServiceContext, consumerServiceContext));
}

export const producedEventsSupportedServices = [
    'lambda'
];

export const producedDeployOutputTypes = [];

export const consumedDeployOutputTypes = [];
