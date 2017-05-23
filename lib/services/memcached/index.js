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

const MEMCACHED_PORT = 11211;
const MEMCACHED_SG_PROTOCOL = "tcp";

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
 * Given the stack name, returns the name of the Memcached cluster
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

function getCompiledMemcachedTemplate(stackName, ownServiceContext, ownPreDeployContext) {
    let serviceParams = ownServiceContext.params;

    let clusterName = getClusterName(ownServiceContext);
    let memcachedSecurityGroupId = ownPreDeployContext['securityGroups'][0].GroupId;
    let cacheSubnetGroup = accountConfig.elasticache_subnet_group;
    let instanceType = serviceParams.instance_type;
    let memcachedVersion = serviceParams.memcached_version;
    let nodeCount = serviceParams.node_count || 1;

    let handlebarsParams = {
        instanceType,
        cacheSubnetGroup,
        memcachedVersion,
        stackName,
        clusterName,
        memcachedSecurityGroupId,
        nodeCount,
        memcachedPort: MEMCACHED_PORT
    }

    //Add tags (if present)
    if (serviceParams.tags) {
        handlebarsParams.tags = serviceParams.tags;
    }

    //Either create custom parameter group if params are specified, or just use default
    if (serviceParams.cache_parameters) {
        handlebarsParams.cacheParameters = serviceParams.cache_parameters;
        handlebarsParams.cacheParameterGroupFamily = 'memcached1.4';
    }
    else {
        handlebarsParams.defaultCacheParameterGroup = 'default.memcached1.4';
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/memcached-template.yml`, handlebarsParams);
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
        errors.push(`Memcached - The 'instance_type' parameter is required`);
    }
    if (!serviceParams.memcached_version) {
        errors.push(`Memcached - The 'memcached_version' parameter is required`);
    }

    return errors;
}

exports.preDeploy = function (serviceContext) {
    let sgName = deployersCommon.getResourceName(serviceContext);
    winston.info(`Memcached - Executing PreDeploy on '${sgName}'`);

    return deployersCommon.createSecurityGroupForService(sgName)
        .then(securityGroup => {
            winston.info(`Memcached - Finished PreDeploy on '${sgName}'`);
            let preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push(securityGroup);
            return preDeployContext;
        });
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`Memcached - Executing Bind on '${stackName}'`);
    let ownSg = ownPreDeployContext.securityGroups[0];
    let sourceSg = dependentOfPreDeployContext.securityGroups[0];

    return ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, ownSg, MEMCACHED_SG_PROTOCOL, MEMCACHED_PORT, MEMCACHED_PORT, accountConfig.vpc)
        .then(() => {
            winston.info(`Memcached - Finished Bind on '${stackName}'`);
            return new BindContext(ownServiceContext, dependentOfServiceContext);
        });
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`Memcached - Executing Deploy on '${stackName}'`);

    return getCompiledMemcachedTemplate(stackName, ownServiceContext, ownPreDeployContext)
        .then(compiledTemplate => {
            return cloudFormationCalls.getStack(stackName)
                .then(stack => {
                    if (!stack) {
                        winston.info(`Memcached - Creating new Memcached cluster '${stackName}'`);
                        return cloudFormationCalls.createStack(stackName, compiledTemplate, [])
                    }
                    else {
                        winston.info(`Memcached - Updating existing Memcached cluster '${stackName}'`);
                        return cloudFormationCalls.updateStack(stackName, compiledTemplate, []);
                    }
                });
        })
        .then(deployedStack => {
            winston.info(`Memcached - Finished Deploy on '${stackName}'`);
            return getDeployContext(ownServiceContext, deployedStack)
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error("The Memcached service doesn't consume events from other services"));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error("The Memcached service doesn't produce events for other services"));
}

exports.unPreDeploy = function (ownServiceContext) {
    let sgName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`Memcached - Executing UnPreDeploy on '${sgName}'`);

    return deployersCommon.deleteSecurityGroupForService(sgName)
        .then(success => {
            winston.info(`Memcached - Finished UnPreDeploy on '${sgName}'`);
            return new UnPreDeployContext(ownServiceContext);
        });
}

exports.unBind = function (ownServiceContext) {
    let sgName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`Memcached - Executing UnBind on ${sgName}`);

    return deployersCommon.unBindAllOnSg(sgName)
        .then(success => {
            winston.info(`Memcached - Finished UnBind on ${sgName}`);
            return new UnBindContext(ownServiceContext);
        });
}

exports.unDeploy = function (ownServiceContext) {
    return deployersCommon.unDeployCloudFormationStack(ownServiceContext, 'Memcached');
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'securityGroups'
];

exports.consumedDeployOutputTypes = [];
