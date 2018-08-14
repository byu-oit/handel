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
    UnDeployContext
} from 'handel-extension-api';
import { awsCalls, deletePhases, deployPhase, handlebars, tagging, checkPhase } from 'handel-extension-support';
import * as winston from 'winston';
import * as route53 from '../../aws/route53-calls';
import {HandlebarsRoute53ZoneTemplate, Route53ZoneServiceConfig} from './config-types';

const SERVICE_NAME = 'Route53';

function getDeployContext(serviceContext: ServiceContext<Route53ZoneServiceConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    const name = awsCalls.cloudFormation.getOutput('ZoneName', cfStack);
    const id = awsCalls.cloudFormation.getOutput('ZoneId', cfStack);
    const nameServers = awsCalls.cloudFormation.getOutput('ZoneNameServers', cfStack);
    if(!name || !id || !nameServers) {
        throw new Error('Expected to receive name, id, and name servers back from Route 53 service');
    }

    const deployContext = new DeployContext(serviceContext);

    // Env variables to inject into consuming services
    deployContext.addEnvironmentVariables({
        ZONE_NAME: name,
        ZONE_ID: id,
        ZONE_NAME_SERVERS: nameServers,
    });

    return deployContext;
}

function getCompiledRoute53Template(ownServiceContext: ServiceContext<Route53ZoneServiceConfig>): Promise<string> {
    const serviceParams = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;

    const handlebarsParams: HandlebarsRoute53ZoneTemplate = {
        name: serviceParams.name,
        tags: tagging.getTags(ownServiceContext)
    };

    if (serviceParams.private) {
        handlebarsParams.vpcs = [{
            id: accountConfig.vpc,
            region: accountConfig.region
        }];
    }

    return handlebars.compileTemplate(`${__dirname}/route53zone-template.yml`, handlebarsParams);
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<Route53ZoneServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors: string[] = checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
    const params = serviceContext.params;
    if (params.name && !route53.isValidHostname(params.name)) {
        errors.push(`'name' parameter must be a valid hostname`);
    }

    return errors.map(error => `${SERVICE_NAME} - ${error}`);
}

export async function deploy(ownServiceContext: ServiceContext<Route53ZoneServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = ownServiceContext.stackName();
    winston.info(`${SERVICE_NAME} - Deploying Route53 Zone ${stackName}`);

    const compiledTemplate = await getCompiledRoute53Template(ownServiceContext);
    const stackTags = tagging.getTags(ownServiceContext);
    const deployedStack = await deployPhase.deployCloudFormationStack(ownServiceContext, stackName, compiledTemplate, [], true, 30, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying S3 bucket ${stackName}`);
    return getDeployContext(ownServiceContext, deployedStack);
}

export async function unDeploy(ownServiceContext: ServiceContext<Route53ZoneServiceConfig>): Promise<UnDeployContext> {
    return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedTypes = [];

export const producedDeployOutputTypes = [
    DeployOutputType.EnvironmentVariables
];

export const consumedDeployOutputTypes = [];

export const supportsTagging = true;
