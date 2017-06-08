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
const ec2Calls = require('../../aws/ec2-calls');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../common/account-config')().getAccountConfig();
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployersCommon = require('../../common/deployers-common');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const handlebarsUtils = require('../../common/handlebars-utils');
const uuid = require('uuid');

const REDIS_PORT = 6379;
const REDIS_SG_PROTOCOL = "tcp";

function getDeployContext(serviceContext, cfStack) {
    let deployContext = new DeployContext(serviceContext);

    // Set port and address environment variables
    let portEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'PORT');
    let port = cloudFormationCalls.getOutput('CachePort', cfStack);
    deployContext.environmentVariables[portEnv] = port;
    let addressEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'ADDRESS');
    let address = cloudFormationCalls.getOutput('CacheAddress', cfStack);
    deployContext.environmentVariables[addressEnv] = address;
    return deployContext;
}

/**
 * Given the stack name, returns the name of the Redis cluster
 * 
 * ElastiCache only allows for a 20-char max cluster name, which means we have to truncate our stack
 * name to fit in it.
 */
function getClusterName(serviceContext) {
    let appFragment = serviceContext.appName.substring(0, 8);
    let envFragement = serviceContext.environmentName.substring(0, 3);
    let serviceFragment = serviceContext.serviceName.substring(0, 3);
    let uuidFragment = uuid().substring(0, 3); //Add a few randomish characters on the end in case there are any collisions by truncating the app, env, and service values
    return `${appFragment}-${envFragement}-${serviceFragment}-${uuidFragment}`;
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

    let clusterName = getClusterName(ownServiceContext);
    let redisSecurityGroupId = ownPreDeployContext['securityGroups'][0].GroupId;
    let cacheSubnetGroup = accountConfig.elasticache_subnet_group;
    let instanceType = serviceParams.instance_type;
    let redisVersion = serviceParams.redis_version;
    // let shards = serviceParams.shards || 1;
    let readReplicas = serviceParams.read_replicas || 0;

    let handlebarsParams = {
        instanceType,
        cacheSubnetGroup,
        redisVersion,
        stackName,
        clusterName,
        redisSecurityGroupId,
        // shards,
        numNodes: readReplicas + 1
    }

    //Add tags (if present)
    if (serviceParams.tags) {
        handlebarsParams.tags = serviceParams.tags;
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

exports.check = function (serviceContext) {
    let errors = [];
    let serviceParams = serviceContext.params;

    if (!serviceParams.instance_type) {
        errors.push(`Redis - The 'instance_type' parameter is required`);
    }
    if (!serviceParams.redis_version) {
        errors.push(`Redis - The 'redis_version' parameter is required`);
    }

    if (serviceParams.read_replicas) {
        if (serviceParams.read_replicas < 0 || serviceParams.read_replicas > 5) {
            errors.push(`Redis - The 'read_replicas' parameter may only have a value of 0-5`);
        }
        if (serviceParams.read_replicas > 0 && (serviceParams.instance_type.includes('t2') || serviceParams.instance_type.includes("t1"))) {
            errors.push(`Redis - You may not use the 't1' and 't2' instance types when using any read replicas`);
        }
    }
    // if(serviceParams.num_shards) {
    //     if(serviceParams.num_shards < 1 || serviceParams.num_shards > 15) {
    //         errors.push(`Redis - The 'num_shards' parameter may only have a value of 1-15`);
    //     }
    //     if(serviceParams.num_shards > 1 && (serviceParams.redis_version.includes("2.6") || serviceParams.redis_version.includes('2.8'))) { //Cluster mode enabled
    //         errors.push(`Redis - You may not use cluster mode (num_shards > 1) unless you are using version 3.2 or higher`);
    //     }
    // }

    return errors;
}

exports.preDeploy = function (serviceContext) {
    let sgName = deployersCommon.getResourceName(serviceContext);
    winston.info(`Redis - Executing PreDeploy on '${sgName}'`);

    return deployersCommon.createSecurityGroupForService(sgName)
        .then(securityGroup => {
            winston.info(`Redis - Finished PreDeploy on '${sgName}'`);
            let preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push(securityGroup);
            return preDeployContext;
        });
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`Redis - Executing Bind on '${stackName}'`);
    let ownSg = ownPreDeployContext.securityGroups[0];
    let sourceSg = dependentOfPreDeployContext.securityGroups[0];

    return ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, ownSg, REDIS_SG_PROTOCOL, REDIS_PORT, REDIS_PORT, accountConfig.vpc)
        .then(() => {
            winston.info(`Redis - Finished Bind on '${stackName}'`);
            return new BindContext(ownServiceContext, dependentOfServiceContext);
        });
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`Redis - Executing Deploy on '${stackName}'`);

    return getCompiledRedisTemplate(stackName, ownServiceContext, ownPreDeployContext)
        .then(compiledTemplate => {
            return deployersCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, "Redis");
        })
        .then(deployedStack => {
            winston.info(`Redis - Finished Deploy on '${stackName}'`);
            return getDeployContext(ownServiceContext, deployedStack)
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error("The Redis service doesn't consume events from other services"));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error("The Redis service doesn't produce events for other services"));
}

exports.unPreDeploy = function (ownServiceContext) {
    let sgName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`Redis - Executing UnPreDeploy on '${sgName}'`);

    return deployersCommon.deleteSecurityGroupForService(sgName)
        .then(success => {
            winston.info(`Redis - Finished UnPreDeploy on '${sgName}'`);
            return new UnPreDeployContext(ownServiceContext);
        });
}

exports.unBind = function (ownServiceContext) {
    let sgName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`Redis - Executing UnBind on ${sgName}`);

    return deployersCommon.unBindAllOnSg(sgName)
        .then(success => {
            winston.info(`Redis - Finished UnBind on ${sgName}`);
            return new UnBindContext(ownServiceContext);
        });
}

exports.unDeploy = function (ownServiceContext) {
    return deployersCommon.unDeployCloudFormationStack(ownServiceContext, 'Redis');
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'securityGroups'
];

exports.consumedDeployOutputTypes = [];
