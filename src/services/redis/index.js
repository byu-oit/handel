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
const winston = require('winston');
const DeployContext = require('../../datatypes/deploy-context').DeployContext;
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../common/bind-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const handlebarsUtils = require('../../common/handlebars-utils');
const elasticacheDeployersCommon = require('../../common/elasticache-deployers-common');

const SERVICE_NAME = "Redis";
const REDIS_PORT = 6379;
const REDIS_SG_PROTOCOL = "tcp";

function getDeployContext(serviceContext, cfStack) {
    let deployContext = new DeployContext(serviceContext);

    // Set port and address environment variables
    let port = cloudFormationCalls.getOutput('CachePort', cfStack);
    let address = cloudFormationCalls.getOutput('CacheAddress', cfStack);

    deployContext.addEnvironmentVariables(deployPhaseCommon.getInjectedEnvVarsFor(serviceContext, {
        PORT: port,
        ADDRESS: address
    }));
    return deployContext;
}

function getCacheParameterGroupFamily(redisVersion) {
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

function getDefaultCacheParameterGroup(redisVersion, numShards) {
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

function getCompiledRedisTemplate(stackName, ownServiceContext, ownPreDeployContext) {
    let serviceParams = ownServiceContext.params;
    let accountConfig = ownServiceContext.accountConfig;

    let clusterName = elasticacheDeployersCommon.getClusterName(ownServiceContext);
    let description = serviceParams.description || 'Parameter group for '+clusterName;
    let redisVersion = serviceParams.redis_version;
    // let shards = serviceParams.shards || 1;
    let readReplicas = serviceParams.read_replicas || 0;

    let handlebarsParams = {
        description: description,
        instanceType: serviceParams.instance_type,
        cacheSubnetGroup: accountConfig.elasticache_subnet_group,
        redisVersion,
        stackName,
        clusterName,
        maintenanceWindow: serviceParams.maintenance_window,
        redisSecurityGroupId: ownPreDeployContext['securityGroups'][0].GroupId,
        snapshotWindow: serviceParams.snapshot_window,
        // shards,
        numNodes: readReplicas + 1,
        tags: deployPhaseCommon.getTags(ownServiceContext)
    }

    //Either create custom parameter group if params are specified, or just use default
    if (serviceParams.cache_parameters) {
        handlebarsParams.cacheParameters = serviceParams.cache_parameters;
        handlebarsParams.cacheParameterGroupFamily = getCacheParameterGroupFamily(redisVersion);
    }
    else {
        handlebarsParams.defaultCacheParameterGroup = getDefaultCacheParameterGroup(redisVersion);
    }

    // if(shards === 1) { //Cluster mode disabled
    if (readReplicas === 0) { //No replication group
        return handlebarsUtils.compileTemplate(`${__dirname}/redis-single-no-repl-template.yml`, handlebarsParams);
    }
    else { //Replication group
        return handlebarsUtils.compileTemplate(`${__dirname}/redis-single-repl-template.yml`, handlebarsParams);
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

exports.check = function (serviceContext, dependenciesServiceContexts) {
    let errors = [];
    let serviceParams = serviceContext.params;

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
        if (serviceParams.read_replicas > 0 && (serviceParams.instance_type.includes('t2') || serviceParams.instance_type.includes("t1"))) {
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

exports.preDeploy = function (serviceContext) {
    return preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    return bindPhaseCommon.bindDependentSecurityGroupToSelf(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, REDIS_SG_PROTOCOL, REDIS_PORT, SERVICE_NAME);
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying cluster '${stackName}'`);

    return getCompiledRedisTemplate(stackName, ownServiceContext, ownPreDeployContext)
        .then(compiledTemplate => {
            let stackTags = deployPhaseCommon.getTags(ownServiceContext);
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME, stackTags);
        })
        .then(deployedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying cluster '${stackName}'`);
            return getDeployContext(ownServiceContext, deployedStack)
        });
}

exports.unPreDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

exports.unBind = function (ownServiceContext) {
    return deletePhasesCommon.unBindSecurityGroups(ownServiceContext, SERVICE_NAME);
}

exports.unDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'securityGroups'
];

exports.consumedDeployOutputTypes = [];
