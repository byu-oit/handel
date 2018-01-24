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
import * as winston from 'winston';
import { BindContext, DeployContext, PreDeployContext, ServiceConfig, ServiceContext, UnBindContext, UnDeployContext, UnPreDeployContext } from '../datatypes';

export async function preDeployNotRequired(serviceContext: ServiceContext<ServiceConfig>): Promise<PreDeployContext> {
    winston.debug(`${serviceContext.serviceType} - PreDeploy is not required for this service, skipping it`);
    return new PreDeployContext(serviceContext);
}

export async function bindNotRequired(ownServiceContext: ServiceContext<ServiceConfig>, dependentOfServiceContext: ServiceContext<ServiceConfig>): Promise<BindContext> {
    winston.debug(`${ownServiceContext.serviceType} - Bind is not required for this service, skipping it`);
    return new BindContext(ownServiceContext, dependentOfServiceContext);
}

export async function deployNotRequired(ownServiceContext: ServiceContext<ServiceConfig>): Promise<DeployContext> {
    winston.debug(`${ownServiceContext.serviceType} - Deploy is not required for this service, skipping it`);
    return new DeployContext(ownServiceContext);
}

export async function unPreDeployNotRequired(ownServiceContext: ServiceContext<ServiceConfig>): Promise<UnPreDeployContext> {
    winston.debug(`${ownServiceContext.serviceType} - UnPreDeploy is not required for this service`);
    return new UnPreDeployContext(ownServiceContext);
}

export async function unBindNotRequired(ownServiceContext: ServiceContext<ServiceConfig>): Promise<UnBindContext> {
    winston.debug(`${ownServiceContext.serviceType} - UnBind is not required for this service`);
    return new UnBindContext(ownServiceContext);
}

export async function unDeployNotRequired(ownServiceContext: ServiceContext<ServiceConfig>): Promise<UnDeployContext> {
    winston.debug(`${ownServiceContext.serviceType} - UnDeploy is not required for this service`);
    return new UnDeployContext(ownServiceContext);
}
