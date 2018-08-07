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
    BindContext,
    DeployContext,
    DeployOutputType,
    PreDeployContext,
    ServiceConfig,
    ServiceContext,
    Tags,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import { awsCalls, bindPhase, checkPhase, deletePhases, handlebars, preDeployPhase, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import { HandlebarsInstanceConfig, HandlebarsNeptuneTemplate, NeptuneConfig } from './config-types';

const SERVICE_NAME = 'Neptune';
const NEPTUNE_PROTOCOL = 'tcp';
const NEPTUNE_PORT = 8182;

function getInstancesHandlebarsConfig(params: NeptuneConfig): HandlebarsInstanceConfig[] {
    const clusterSize = params.cluster_size || 1;
    const instances: HandlebarsInstanceConfig[] = [];
    for(let i = 0; i < clusterSize; i++) {
        instances.push({
            instanceType: params.instance_type || 'db.r4.large'
        });
    }
    return instances;
}

function iamAuthEnabled(serviceContext: ServiceContext<NeptuneConfig>) {
    const params = serviceContext.params;
    // Default to true if not specified, otherwise use what the user specified
    return params.iam_auth_enabled !== undefined ? params.iam_auth_enabled : true;
}

function getCompiledTemplate(stackName: string,
        ownServiceContext: ServiceContext<NeptuneConfig>,
        ownPreDeployContext: PreDeployContext,
        tags: Tags) {
    const params = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;
    const dbName = stackName.toLowerCase();
    const handlebarsParams: HandlebarsNeptuneTemplate = {
        description: params.description || 'Handel-created Aurora cluster',
        parameterGroupFamily: 'neptune1',
        clusterParameters: params.cluster_parameters,
        instanceParameters: params.instance_parameters,
        tags,
        dbName,
        dbSubnetGroup: accountConfig.rds_subnet_group,
        port: NEPTUNE_PORT,
        dbSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId!,
        iamAuthEnabled: iamAuthEnabled(ownServiceContext),
        instances: getInstancesHandlebarsConfig(params)
    };

    return handlebars.compileTemplate(`${__dirname}/neptune-template.yml`, handlebarsParams);
}

function getDeployContext(serviceContext: ServiceContext<NeptuneConfig>,
    cfStack: any) { // TODO - Better type later
    const accountConfig = serviceContext.accountConfig;
    const deployContext = new DeployContext(serviceContext);

    // Inject ENV variables to talk to this database
    const clusterEndpoint = awsCalls.cloudFormation.getOutput('ClusterEndpoint', cfStack);
    const port = awsCalls.cloudFormation.getOutput('ClusterPort', cfStack);
    const readEndpoint = awsCalls.cloudFormation.getOutput('ClusterReadEndpoint', cfStack);
    const clusterId = awsCalls.cloudFormation.getOutput('ClusterId', cfStack);

    if(!clusterEndpoint || !port || !readEndpoint || !clusterId) {
        throw new Error('Expected Neptune service to return addresses, port, and cluster id');
    }

    deployContext.addEnvironmentVariables({
        CLUSTER_ENDPOINT: clusterEndpoint,
        PORT: port,
        READ_ENDPOINT: readEndpoint
    });

    // Policy to talk to this database if IAM Authentication is enabled
    if(iamAuthEnabled(serviceContext)) {
        deployContext.policies.push({
            'Effect': 'Allow',
            'Action': [
                'neptune-db:*'
            ],
            'Resource': [
                `arn:aws:neptune-db:${accountConfig.region}:${accountConfig.account_id}:${clusterId}/*`
            ]
        });
    }

    return deployContext;
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<NeptuneConfig>,
    dependenciesServiceContext: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors: string[] = checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
    return errors.map(error => `${SERVICE_NAME} - ${error}`);
}

export function preDeploy(serviceContext: ServiceContext<NeptuneConfig>): Promise<PreDeployContext> {
    return preDeployPhase.preDeployCreateSecurityGroup(serviceContext, NEPTUNE_PORT, SERVICE_NAME);
}

export function bind(ownServiceContext: ServiceContext<NeptuneConfig>,
    ownPreDeployContext: PreDeployContext,
    dependentOfServiceContext: ServiceContext<ServiceConfig>,
    dependentOfPreDeployContext: PreDeployContext): Promise<BindContext> {
    return bindPhase.bindDependentSecurityGroup(ownServiceContext,
        ownPreDeployContext,
        dependentOfServiceContext,
        dependentOfPreDeployContext,
        NEPTUNE_PROTOCOL,
        NEPTUNE_PORT,
        SERVICE_NAME);
}

export async function deploy(ownServiceContext: ServiceContext<NeptuneConfig>,
    ownPreDeployContext: PreDeployContext,
    dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = ownServiceContext.stackName();
    winston.info(`${SERVICE_NAME} - Deploying database '${stackName}'`);

    const stack = await awsCalls.cloudFormation.getStack(stackName);
    if (!stack) {
        const stackTags = tagging.getTags(ownServiceContext);
        const compiledTemplate = await getCompiledTemplate(stackName, ownServiceContext, ownPreDeployContext, stackTags);
        winston.debug(`${SERVICE_NAME} - Creating CloudFormation stack '${stackName}'`);
        const deployedStack = await awsCalls.cloudFormation.createStack(stackName,
            compiledTemplate,
            [],
            30,
            stackTags);
        winston.debug(`${SERVICE_NAME} - Finished creating CloudFormation stack '${stackName}`);
        winston.info(`${SERVICE_NAME} - Finished deploying database '${stackName}'`);
        return getDeployContext(ownServiceContext, deployedStack);
    }
    else {
        winston.info(`${SERVICE_NAME} - Updates are not supported for this service.`);
        return getDeployContext(ownServiceContext, stack);
    }
}

export function unPreDeploy(ownServiceContext: ServiceContext<NeptuneConfig>): Promise<UnPreDeployContext> {
    return deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

export function unBind(ownServiceContext: ServiceContext<NeptuneConfig>): Promise<UnBindContext> {
    return deletePhases.unBindSecurityGroups(ownServiceContext, SERVICE_NAME);
}

export async function unDeploy(ownServiceContext: ServiceContext<NeptuneConfig>): Promise<UnDeployContext> {
    return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedTypes = [];

export const producedDeployOutputTypes = [
    DeployOutputType.EnvironmentVariables,
    DeployOutputType.SecurityGroups
];

export const consumedDeployOutputTypes = [];

export const supportsTagging = true;
