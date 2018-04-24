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
    PreDeployContext,
    ServiceConfig,
    ServiceContext,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import { awsCalls, bindPhase, deletePhases, deployPhase, handlebars, preDeployPhase, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as elasticacheDeployersCommon from '../../common/elasticache-deployers-common';
import { HandlebarsRedisTemplate, RedisServiceConfig } from './config-types';

const SERVICE_NAME = 'Redis';
const REDIS_PORT = 6379;
const REDIS_SG_PROTOCOL = 'tcp';

function getDeployContext(serviceContext: ServiceContext<RedisServiceConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    const deployContext = new DeployContext(serviceContext);

    // Set port and address environment variables
    const port = awsCalls.cloudFormation.getOutput('CachePort', cfStack);
    const address = awsCalls.cloudFormation.getOutput('CacheAddress', cfStack);
    if(!port || !address) {
        throw new Error('Expected to receive port and address back from Redis service');
    }

    deployContext.addEnvironmentVariables({
        PORT: port,
        ADDRESS: address
    });
    return deployContext;
}

function getCacheParameterGroupFamily(redisVersion: string): string {
    if (redisVersion.startsWith('2.6')) {
        return 'redis2.6';
    }
    else if (redisVersion.startsWith('2.8')) {
        return 'redis2.8';
    }
    else {
        return 'redis3.2';
    }
}

function getDefaultCacheParameterGroup(redisVersion: string): string {
    if (redisVersion.startsWith('2.6')) {
        return 'default.redis2.6';
    }
    else if (redisVersion.startsWith('2.8')) {
        return 'default.redis2.6';
    }
    // else if(redisVersion.startsWith('3.2') && numShards > 1) {
    //     return 'default.redis3.2.cluster.on';
    // }
    else {
        return 'default.redis3.2';
    }
}

function getCompiledRedisTemplate(stackName: string, ownServiceContext: ServiceContext<RedisServiceConfig>, ownPreDeployContext: PreDeployContext): Promise<string> {
    const serviceParams = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;

    const clusterName = elasticacheDeployersCommon.getClusterName(ownServiceContext);
    const description = serviceParams.description || `Parameter group for ${clusterName}`;
    const redisVersion = serviceParams.redis_version;
    // let shards = serviceParams.shards || 1;
    const readReplicas = serviceParams.read_replicas || 0;

    const handlebarsParams: HandlebarsRedisTemplate = {
        description: description,
        instanceType: serviceParams.instance_type,
        cacheSubnetGroup: accountConfig.elasticache_subnet_group,
        redisVersion,
        stackName,
        clusterName,
        maintenanceWindow: serviceParams.maintenance_window,
        redisSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId!,
        snapshotWindow: serviceParams.snapshot_window,
        // shards,
        numNodes: readReplicas + 1,
        tags: tagging.getTags(ownServiceContext)
    };

    // Either create custom parameter group if params are specified, or just use default
    if (serviceParams.cache_parameters) {
        handlebarsParams.cacheParameters = serviceParams.cache_parameters;
        handlebarsParams.cacheParameterGroupFamily = getCacheParameterGroupFamily(redisVersion);
    }
    else {
        handlebarsParams.defaultCacheParameterGroup = getDefaultCacheParameterGroup(redisVersion);
    }

    // if(shards === 1) { //Cluster mode disabled
    if (readReplicas === 0) { // No replication group
        return handlebars.compileTemplate(`${__dirname}/redis-single-no-repl-template.yml`, handlebarsParams);
    }
    else { // Replication group
        return handlebars.compileTemplate(`${__dirname}/redis-single-repl-template.yml`, handlebarsParams);
    }
    // }
    // else { //Cluster mode enabled (includes replication group)
    //     return handlebarsUtils.compileTemplate(`${__dirname}/redis-cluster-template.yml`, handlebarsParams);
    // }
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<RedisServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors = [];
    const serviceParams = serviceContext.params;

    if (!serviceParams.instance_type) {
        errors.push(`${SERVICE_NAME} - The 'instance_type' parameter is required`);
    }
    if (!serviceParams.redis_version) {
        errors.push(`${SERVICE_NAME} - The 'redis_version' parameter is required`);
    }

    if (serviceParams.read_replicas) {
        if (serviceParams.read_replicas < 0 || serviceParams.read_replicas > 5) {
            errors.push(`${SERVICE_NAME} - The 'read_replicas' parameter may only have a value of 0-5`);
        }
        if (serviceParams.read_replicas > 0 && (serviceParams.instance_type.includes('t2') || serviceParams.instance_type.includes('t1'))) {
            errors.push(`${SERVICE_NAME} - You may not use the 't1' and 't2' instance types when using any read replicas`);
        }
    }
    // if(serviceParams.num_shards) {
    //     if(serviceParams.num_shards < 1 || serviceParams.num_shards > 15) {
    //         errors.push(`${SERVICE_NAME} - The 'num_shards' parameter may only have a value of 1-15`);
    //     }
    //     if(serviceParams.num_shards > 1 && (serviceParams.redis_version.includes("2.6") || serviceParams.redis_version.includes('2.8'))) { //Cluster mode enabled
    //         errors.push(`${SERVICE_NAME} - You may not use cluster mode (num_shards > 1) unless you are using version 3.2 or higher`);
    //     }
    // }

    return errors;
}

export async function preDeploy(serviceContext: ServiceContext<RedisServiceConfig>): Promise<PreDeployContext> {
    return preDeployPhase.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
}

export async function bind(ownServiceContext: ServiceContext<RedisServiceConfig>, ownPreDeployContext: PreDeployContext, dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: PreDeployContext): Promise<BindContext> {
    return bindPhase.bindDependentSecurityGroup(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, REDIS_SG_PROTOCOL, REDIS_PORT, SERVICE_NAME);
}

export async function deploy(ownServiceContext: ServiceContext<RedisServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = ownServiceContext.stackName();
    winston.info(`${SERVICE_NAME} - Deploying cluster '${stackName}'`);

    const compiledTemplate = await getCompiledRedisTemplate(stackName, ownServiceContext, ownPreDeployContext);
    const stackTags = tagging.getTags(ownServiceContext);
    const deployedStack = await deployPhase.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME, 30, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying cluster '${stackName}'`);
    return getDeployContext(ownServiceContext, deployedStack);

}

export async function unPreDeploy(ownServiceContext: ServiceContext<RedisServiceConfig>): Promise<UnPreDeployContext> {
    return deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

export async function unBind(ownServiceContext: ServiceContext<RedisServiceConfig>): Promise<UnBindContext> {
    return deletePhases.unBindSecurityGroups(ownServiceContext, SERVICE_NAME);
}

export async function unDeploy(ownServiceContext: ServiceContext<RedisServiceConfig>): Promise<UnDeployContext> {
    return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = [
    'environmentVariables',
    'securityGroups'
];

export const consumedDeployOutputTypes = [];

export const supportsTagging = true;
