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
import { awsCalls, bindPhase, checkPhase, deletePhases, deployPhase, handlebars, preDeployPhase, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import * as iamCalls from '../../aws/iam-calls';
import { ElasticsearchConfig, HandlebarsDedicatedMasterNode, HandlebarsEbs, HandlebarsElasticsearchTemplate } from './config-types';

const SERVICE_NAME = 'Elasticsearch';
const ES_PROTOCOL = 'tcp';
const ES_PORT = 8182;

const INSTANCE_STORAGE_TYPES = [
    'm3.*',
    'r3.*',
    'i2.*',
    'i3.*'
];

function getDomainName(serviceContext: ServiceContext<ElasticsearchConfig>) {
    const appFragment = serviceContext.appName.substring(0, 10);
    const envFragement = serviceContext.environmentName.substring(0, 8);
    const serviceFragment = serviceContext.serviceName.substring(0, 8);
    return `${appFragment}-${envFragement}-${serviceFragment}`;
}

function getDedicatedMasterConfig(serviceParams: ElasticsearchConfig): HandlebarsDedicatedMasterNode | undefined {
    if(serviceParams.master_node) {
        return {
            instanceType: serviceParams.master_node.instance_type,
            instanceCount: serviceParams.master_node.instance_count
        };
    }
}

function getEbsConfig(serviceParams: ElasticsearchConfig): HandlebarsEbs | undefined {
    if(serviceParams.ebs) {
        return {
            volumeSize: serviceParams.ebs.size_gb,
            provisionedIops: serviceParams.ebs.provisioned_iops
        };
    }
}

function getCompiledTemplate(ownServiceContext: ServiceContext<ElasticsearchConfig>, ownPreDeployContext: PreDeployContext, tags: Tags) {
    const params = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;
    const domainName = getDomainName(ownServiceContext);
    const handlebarsParams: HandlebarsElasticsearchTemplate = {
        domainName,
        elasticsearchVersion: params.version,
        tags,
        subnetId: accountConfig.data_subnets[0],
        securityGroupId: ownPreDeployContext.securityGroups[0].GroupId!,
        instanceCount: params.instance_count || 1,
        instanceType: params.instance_type || 't2.small.elasticsearch',
        dedicatedMasterNode: getDedicatedMasterConfig(params),
        ebs: getEbsConfig(params)
    };

    return handlebars.compileTemplate(`${__dirname}/elasticsearch-template.yml`, handlebarsParams);
}

function getDeployContext(serviceContext: ServiceContext<ElasticsearchConfig>,
    cfStack: any) { // TODO - Better type later
    const deployContext = new DeployContext(serviceContext);

    // Inject ENV variables to talk to this database
    const domainEndpoint = awsCalls.cloudFormation.getOutput('DomainEndpoint', cfStack);
    if(!domainEndpoint) {
        throw new Error('Expected Elasticsearch service to return domain endpoint');
    }

    deployContext.addEnvironmentVariables({
        DOMAIN_ENDPOINT: domainEndpoint
    });

    // TODO - Add policies

    return deployContext;
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<ElasticsearchConfig>,
    dependenciesServiceContext: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors: string[] = checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
    return errors.map(error => `${SERVICE_NAME} - ${error}`);
}

export function preDeploy(serviceContext: ServiceContext<ElasticsearchConfig>): Promise<PreDeployContext> {
    return preDeployPhase.preDeployCreateSecurityGroup(serviceContext, ES_PORT, SERVICE_NAME);
}

export function bind(ownServiceContext: ServiceContext<ElasticsearchConfig>,
    ownPreDeployContext: PreDeployContext,
    dependentOfServiceContext: ServiceContext<ServiceConfig>,
    dependentOfPreDeployContext: PreDeployContext): Promise<BindContext> {
    return bindPhase.bindDependentSecurityGroup(ownServiceContext,
        ownPreDeployContext,
        dependentOfServiceContext,
        dependentOfPreDeployContext,
        ES_PROTOCOL,
        ES_PORT,
        SERVICE_NAME);
}

export async function deploy(ownServiceContext: ServiceContext<ElasticsearchConfig>,
    ownPreDeployContext: PreDeployContext,
    dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = ownServiceContext.stackName();
    winston.info(`${SERVICE_NAME} - Deploying domain '${stackName}'`);
    await iamCalls.createServiceLinkedRole('es.amazonaws.com');
    const stackTags = tagging.getTags(ownServiceContext);
    const compiledTemplate = await getCompiledTemplate(ownServiceContext, ownPreDeployContext, stackTags);
    const deployedStack = await deployPhase.deployCloudFormationStack(ownServiceContext, stackName, compiledTemplate, [], true, 30, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying domain '${stackName}'`);
    return getDeployContext(ownServiceContext, deployedStack);
}

export function unPreDeploy(ownServiceContext: ServiceContext<ElasticsearchConfig>): Promise<UnPreDeployContext> {
    return deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

export function unBind(ownServiceContext: ServiceContext<ElasticsearchConfig>): Promise<UnBindContext> {
    return deletePhases.unBindSecurityGroups(ownServiceContext, SERVICE_NAME);
}

export async function unDeploy(ownServiceContext: ServiceContext<ElasticsearchConfig>): Promise<UnDeployContext> {
    return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedTypes = [];

export const producedDeployOutputTypes = [
    DeployOutputType.EnvironmentVariables,
    DeployOutputType.SecurityGroups
];

export const consumedDeployOutputTypes = [];

export const supportsTagging = true;
