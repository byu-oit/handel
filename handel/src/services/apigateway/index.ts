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
    DeployOutputType,
    PreDeployContext,
    ServiceConfig,
    ServiceContext,
    ServiceDeployer,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import {
    checkPhase,
    deletePhases,
    preDeployPhase
 } from 'handel-extension-support';
import * as winston from 'winston';
import {isValidHostname} from '../../aws/route53-calls';
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

export class Service implements ServiceDeployer {
    public readonly producedDeployOutputTypes = [];
    public readonly consumedDeployOutputTypes = [
        DeployOutputType.Policies,
        DeployOutputType.EnvironmentVariables,
        DeployOutputType.SecurityGroups
    ];
    public readonly producedEventsSupportedTypes = [];
    public readonly providedEventType = null;
    public readonly supportsTagging = true;

    public check(serviceContext: ServiceContext<APIGatewayConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
        const params = serviceContext.params;
        let errors = checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
        if(errors.length === 0) {
            errors = errors.concat(checkCommon(serviceContext, dependenciesServiceContexts));
            if(params.proxy) {
                errors = errors.concat(proxyPassthroughDeployType.check(serviceContext, dependenciesServiceContexts, SERVICE_NAME));
            }
            else if(params.swagger) {
                errors = errors.concat(swaggerDeployType.check(serviceContext, dependenciesServiceContexts, SERVICE_NAME));
            }
            else {
                return [`You must specify either the 'proxy' or 'swagger' section`];
            }
        }
        return errors;
    }

    public async preDeploy(serviceContext: ServiceContext<APIGatewayConfig>): Promise<PreDeployContext> {
        if(serviceContext.params.vpc) {
            return preDeployPhase.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
        } else {
            return lifecyclesCommon.preDeployNotRequired(serviceContext);
        }
    }

    public async getPreDeployContext(serviceContext: ServiceContext<APIGatewayConfig>): Promise<PreDeployContext> {
        if(serviceContext.params.vpc) {
            return preDeployPhase.getSecurityGroup(serviceContext);
        } else {
            return lifecyclesCommon.preDeployNotRequired(serviceContext);
        }
    }

    public async deploy(ownServiceContext: ServiceContext<APIGatewayConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
        const stackName = ownServiceContext.stackName();
        winston.info(`${SERVICE_NAME} - Deploying API Gateway service '${stackName}'`);
        if(ownServiceContext.params.swagger) {
            return swaggerDeployType.deploy(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, SERVICE_NAME);
        }
        else {
            return proxyPassthroughDeployType.deploy(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, SERVICE_NAME);
        }
    }

    public async unPreDeploy(ownServiceContext: ServiceContext<APIGatewayConfig>): Promise<UnPreDeployContext> {
        if(ownServiceContext.params.vpc) {
            return deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
        } else {
            return lifecyclesCommon.unPreDeployNotRequired(ownServiceContext);
        }
    }

    public async unDeploy(ownServiceContext: ServiceContext<APIGatewayConfig>): Promise<UnDeployContext> {
        return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
    }
}
