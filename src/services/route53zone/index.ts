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
import * as cloudFormationCalls from '../../aws/cloudformation-calls';
import * as route53 from '../../aws/route53-calls';
import * as deletePhasesCommon from '../../common/delete-phases-common';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as handlebarsUtils from '../../common/handlebars-utils';
import { DeployContext, PreDeployContext, ServiceConfig, ServiceContext, UnDeployContext } from '../../datatypes';
import { HandlebarsRoute53ZoneTemplate, Route53ZoneServiceConfig } from './config-types';

const SERVICE_NAME = 'Route53';

function getDeployContext(serviceContext: ServiceContext<Route53ZoneServiceConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    const name = cloudFormationCalls.getOutput('ZoneName', cfStack);
    const id = cloudFormationCalls.getOutput('ZoneId', cfStack);
    const nameServers = cloudFormationCalls.getOutput('ZoneNameServers', cfStack);

    const deployContext = new DeployContext(serviceContext);

    // Env variables to inject into consuming services
    deployContext.addEnvironmentVariables(deployPhaseCommon.getInjectedEnvVarsFor(serviceContext, {
        ZONE_NAME: name,
        ZONE_ID: id,
        ZONE_NAME_SERVERS: nameServers,
    }));

    return deployContext;
}

function getCompiledRoute53Template(ownServiceContext: ServiceContext<Route53ZoneServiceConfig>): Promise<string> {
    const serviceParams = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;

    const handlebarsParams: HandlebarsRoute53ZoneTemplate = {
        name: serviceParams.name,
        tags: deployPhaseCommon.getTags(ownServiceContext)
    };

    if (serviceParams.private) {
        handlebarsParams.vpcs = [{
            id: accountConfig.vpc,
            region: accountConfig.region
        }];
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/route53zone-template.yml`, handlebarsParams);
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<Route53ZoneServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors = [];

    const params = serviceContext.params;

    if (!params.name) {
        errors.push(`${SERVICE_NAME} - 'name' parameter must be specified`);
    } else if (!route53.isValidHostname(params.name)) {
        errors.push(`${SERVICE_NAME} - 'name' parameter must be a valid hostname`);
    }

    if (params.private && typeof params.private !== 'boolean') {
        errors.push(`${SERVICE_NAME} - 'private' parameter must be 'true' or 'false'`);
    }

    return errors;
}

export async function deploy(ownServiceContext: ServiceContext<Route53ZoneServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying Route53 Zone ${stackName}`);

    const compiledTemplate = await getCompiledRoute53Template(ownServiceContext);
    const stackTags = deployPhaseCommon.getTags(ownServiceContext);
    const deployedStack = await deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying S3 bucket ${stackName}`);
    return getDeployContext(ownServiceContext, deployedStack);
}

export async function unDeploy(ownServiceContext: ServiceContext<Route53ZoneServiceConfig>): Promise<UnDeployContext> {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = [
    'environmentVariables'
];

export const consumedDeployOutputTypes = [];
