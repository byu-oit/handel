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
import { DeployContext, PreDeployContext, ServiceConfig, ServiceContext, UnDeployContext, UnPreDeployContext } from 'handel-extension-api';
import * as extensionSupport from 'handel-extension-support';
import * as winston from 'winston';
import {isValidHostname} from '../../aws/route53-calls';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as lifecyclesCommon from '../../common/lifecycles-common';
import {APIGatewayConfig, CustomDomain} from './config-types';
import * as proxyPassthroughDeployType from './proxy/proxy-passthrough-deploy-type';
import * as swaggerDeployType from './swagger/swagger-deploy-type';

const SERVICE_NAME = 'API Gateway';

function checkCommon(serviceContext: ServiceContext<APIGatewayConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const params = serviceContext.params;

    const errors: string[] = [];

    if (params.custom_domains) {
        errors.push(...checkCustomDomains(params.custom_domains));
    }

    if (dependenciesServiceContexts) {
        dependenciesServiceContexts.forEach((dependencyServiceContext) => {
            if (dependencyServiceContext.serviceInfo.producedDeployOutputTypes.includes('securityGroups') && !params.vpc) {
                errors.push(`${SERVICE_NAME} - The 'vpc' parameter is required and must be true when declaring dependencies of type ${dependencyServiceContext.serviceType}`);
            }
        });
    }

    return errors;
}

export function checkCustomDomains(customDomains?: CustomDomain[]): string[] {
    if (!customDomains || customDomains.length === 0) {
        return [];
    }
    // equivalent to flatMap
    return customDomains.map(checkCustomDomain)
        .reduce((acc, cur) => acc.concat(cur), []);
}

function checkCustomDomain(domain: CustomDomain): string[] {
    const errors = [];
    if (!domain.dns_name) {
        errors.push(`${SERVICE_NAME} - 'dns_name' parameter is required`);
    } else if (!isValidHostname(domain.dns_name)) {
        errors.push(`${SERVICE_NAME} - 'dns_name' must be a valid DNS hostname`);
    }
    if (!domain.https_certificate) {
        errors.push(`${SERVICE_NAME} - 'https_certificate' parameter is required`);
    }
    return errors;
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<APIGatewayConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const params = serviceContext.params;

    const commonErrors = checkCommon(serviceContext, dependenciesServiceContexts);

    let deployTypeErrors: string[];
    if(params.proxy) {
        deployTypeErrors = proxyPassthroughDeployType.check(serviceContext, dependenciesServiceContexts, SERVICE_NAME);
    }
    else if(params.swagger) {
        deployTypeErrors = swaggerDeployType.check(serviceContext, dependenciesServiceContexts, SERVICE_NAME);
    }
    else {
        winston.warn(`Top-level proxy configuration is deprecated. You should use the 'proxy' section instead`);
        deployTypeErrors = proxyPassthroughDeployType.check(serviceContext, dependenciesServiceContexts, SERVICE_NAME);
        // return [`${SERVICE_NAME} - You must specify either the 'proxy' or 'swagger' section`];
    }
    return commonErrors.concat(deployTypeErrors);
}

export function preDeploy(serviceContext: ServiceContext<APIGatewayConfig>): Promise<PreDeployContext> {
    if(serviceContext.params.vpc) {
        return extensionSupport.preDeployPhase.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
    } else {
        return lifecyclesCommon.preDeployNotRequired(serviceContext);
    }
}

export function deploy(ownServiceContext: ServiceContext<APIGatewayConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = ownServiceContext.stackName();
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
        return extensionSupport.deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
    } else {
        return lifecyclesCommon.unPreDeployNotRequired(ownServiceContext);
    }
}

export function unDeploy(ownServiceContext: ServiceContext<APIGatewayConfig>): Promise<UnDeployContext> {
    return extensionSupport.deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = [];

export const consumedDeployOutputTypes = [
    'environmentVariables',
    'policies',
    'securityGroups'
];

export const supportsTagging = true;
