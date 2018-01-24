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
import * as deletePhasesCommon from '../../common/delete-phases-common';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as lifecyclesCommon from '../../common/lifecycles-common';
import * as preDeployPhaseCommon from '../../common/pre-deploy-phase-common';
import { DeployContext, PreDeployContext, ServiceConfig, ServiceContext, UnDeployContext, UnPreDeployContext } from '../../datatypes/index';
import { APIGatewayConfig } from './config-types';
import * as proxyPassthroughDeployType from './proxy/proxy-passthrough-deploy-type';
import * as swaggerDeployType from './swagger/swagger-deploy-type';

const SERVICE_NAME = 'API Gateway';

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<APIGatewayConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const params = serviceContext.params;

    if(params.proxy) {
        return proxyPassthroughDeployType.check(serviceContext, dependenciesServiceContexts, SERVICE_NAME);
    }
    else if(params.swagger) {
        return swaggerDeployType.check(serviceContext, dependenciesServiceContexts, SERVICE_NAME);
    }
    else {
        winston.warn(`Top-level proxy configuration is deprecated. You should use the 'proxy' section instead`);
        return proxyPassthroughDeployType.check(serviceContext, dependenciesServiceContexts, SERVICE_NAME);
        // return [`${SERVICE_NAME} - You must specify either the 'proxy' or 'swagger' section`];
    }
}

export function preDeploy(serviceContext: ServiceContext<APIGatewayConfig>): Promise<PreDeployContext> {
    if(serviceContext.params.vpc) {
        return preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
    } else {
        return lifecyclesCommon.preDeployNotRequired(serviceContext);
    }
}

export function deploy(ownServiceContext: ServiceContext<APIGatewayConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying API Gateway service '${stackName}'`);
    if(ownServiceContext.params.swagger) {
        return swaggerDeployType.deploy(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, SERVICE_NAME);
    }
    else {
        return proxyPassthroughDeployType.deploy(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, SERVICE_NAME);
    }
}

export function unPreDeploy(ownServiceContext: ServiceContext<APIGatewayConfig>): Promise<UnPreDeployContext> {
    if(ownServiceContext.params.vpc) {
        return deletePhasesCommon.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
    } else {
        return lifecyclesCommon.unPreDeployNotRequired(ownServiceContext);
    }
}

export function unDeploy(ownServiceContext: ServiceContext<APIGatewayConfig>): Promise<UnDeployContext> {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = [];

export const consumedDeployOutputTypes = [
    'environmentVariables',
    'policies',
    'securityGroups'
];
