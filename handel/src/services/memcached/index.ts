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
    ServiceDeployer,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import {
    awsCalls,
    bindPhase,
    checkPhase,
    deletePhases,
    deployPhase,
    handlebars,
    preDeployPhase,
    tagging
} from 'handel-extension-support';
import * as winston from 'winston';
import * as elasticacheDeployersCommon from '../../common/elasticache-deployers-common';
import {HandlebarsMemcachedTemplate, MemcachedServiceConfig} from './config-types';

const SERVICE_NAME = 'Memcached';
const MEMCACHED_PORT = 11211;
const MEMCACHED_SG_PROTOCOL = 'tcp';

function getDeployContext(serviceContext: ServiceContext<MemcachedServiceConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    const deployContext = new DeployContext(serviceContext);

    // Set port and address environment variables
    const port = awsCalls.cloudFormation.getOutput('CachePort', cfStack);
    const address = awsCalls.cloudFormation.getOutput('CacheAddress', cfStack);
    if(!port || !address) {
        throw new Error('Expected to receive port and address back from Memcached service');
    }

    deployContext.addEnvironmentVariables({
        PORT: port,
        ADDRESS: address
    });

    return deployContext;
}

function getCompiledMemcachedTemplate(stackName: string, ownServiceContext: ServiceContext<MemcachedServiceConfig>, ownPreDeployContext: PreDeployContext): Promise<string> {
    const serviceParams = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;

    const clusterName = elasticacheDeployersCommon.getClusterName(ownServiceContext);

    const handlebarsParams: HandlebarsMemcachedTemplate = {
        description: serviceParams.description || 'Parameter group for ' + clusterName,
        instanceType: serviceParams.instance_type,
        cacheSubnetGroup: accountConfig.elasticache_subnet_group,
        memcachedVersion: serviceParams.memcached_version,
        stackName,
        clusterName,
        memcachedSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId!,
        nodeCount: serviceParams.node_count || 1,
        memcachedPort: MEMCACHED_PORT,
        tags: tagging.getTags(ownServiceContext)
    };

    // Either create custom parameter group if params are specified, or just use default
    if (serviceParams.cache_parameters) {
        handlebarsParams.cacheParameters = serviceParams.cache_parameters;
        handlebarsParams.cacheParameterGroupFamily = 'memcached1.4';
    }
    else {
        handlebarsParams.defaultCacheParameterGroup = 'default.memcached1.4';
    }

    return handlebars.compileTemplate(`${__dirname}/memcached-template.yml`, handlebarsParams);
}

export class Service implements ServiceDeployer {
    public readonly producedEventsSupportedTypes = [];
    public readonly producedDeployOutputTypes = [
        DeployOutputType.EnvironmentVariables,
        DeployOutputType.SecurityGroups
    ];
    public readonly consumedDeployOutputTypes = [];
    public readonly providedEventType = null;
    public readonly supportsTagging = true;

    public check(serviceContext: ServiceContext<MemcachedServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
        return checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
    }

    public async preDeploy(serviceContext: ServiceContext<MemcachedServiceConfig>): Promise<PreDeployContext> {
        return preDeployPhase.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
    }

    public async getPreDeployContext(serviceContext: ServiceContext<MemcachedServiceConfig>): Promise<PreDeployContext> {
        return preDeployPhase.getSecurityGroup(serviceContext);
    }

    public async bind(ownServiceContext: ServiceContext<MemcachedServiceConfig>, ownPreDeployContext: PreDeployContext, dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: PreDeployContext): Promise<BindContext> {
        return bindPhase.bindDependentSecurityGroup(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, MEMCACHED_SG_PROTOCOL, MEMCACHED_PORT);
    }

    public async deploy(ownServiceContext: ServiceContext<MemcachedServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
        const stackName = ownServiceContext.stackName();
        winston.info(`${SERVICE_NAME} - Deploying cluster '${stackName}'`);
        const compiledTemplate = await getCompiledMemcachedTemplate(stackName, ownServiceContext, ownPreDeployContext);
        const stackTags = tagging.getTags(ownServiceContext);
        const deployedStack = await deployPhase.deployCloudFormationStack(ownServiceContext, stackName, compiledTemplate, [], true, 30, stackTags);
        winston.info(`${SERVICE_NAME} - Finished deploying cluster '${stackName}'`);
        return getDeployContext(ownServiceContext, deployedStack);
    }

    public async unPreDeploy(ownServiceContext: ServiceContext<MemcachedServiceConfig>): Promise<UnPreDeployContext> {
        return deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
    }

    public async unBind(ownServiceContext: ServiceContext<MemcachedServiceConfig>, ownPreDeployContext: PreDeployContext, dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: PreDeployContext): Promise<UnBindContext> {
        return deletePhases.unBindService(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, MEMCACHED_SG_PROTOCOL, MEMCACHED_PORT);
    }

    public async unDeploy(ownServiceContext: ServiceContext<MemcachedServiceConfig>): Promise<UnDeployContext> {
        return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
    }
}
