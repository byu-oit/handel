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
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../common/account-config')().getAccountConfig();
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../common/bind-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const handlebarsUtils = require('../../common/handlebars-utils');
const uuid = require('uuid');

const SERVICE_NAME = "Memcached";
const MEMCACHED_PORT = 11211;
const MEMCACHED_SG_PROTOCOL = "tcp";

function getDeployContext(serviceContext, cfStack) {
    let deployContext = new DeployContext(serviceContext);

    // Set port and address environment variables
    let portEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, 'PORT');
    let port = cloudFormationCalls.getOutput('CachePort', cfStack);
    deployContext.environmentVariables[portEnv] = port;
    let addressEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, 'ADDRESS');
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
        errors.push(`${SERVICE_NAME} - The 'instance_type' parameter is required`);
    }
    if (!serviceParams.memcached_version) {
        errors.push(`${SERVICE_NAME} - The 'memcached_version' parameter is required`);
    }

    return errors;
}

exports.preDeploy = function (serviceContext) {
    return preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    return bindPhaseCommon.bindDependentSecurityGroupToSelf(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, MEMCACHED_SG_PROTOCOL, MEMCACHED_PORT, SERVICE_NAME);
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Executing Deploy on '${stackName}'`);

    return getCompiledMemcachedTemplate(stackName, ownServiceContext, ownPreDeployContext)
        .then(compiledTemplate => {
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME);
        })
        .then(deployedStack => {
            winston.info(`${SERVICE_NAME} - Finished Deploy on '${stackName}'`);
            return getDeployContext(ownServiceContext, deployedStack)
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't consume events from other services`));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't produce events for other services`));
}

exports.unPreDeploy = function (ownServiceContext) {
    let sgName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Executing UnPreDeploy on '${sgName}'`);

    return deletePhasesCommon.deleteSecurityGroupForService(sgName)
        .then(success => {
            winston.info(`${SERVICE_NAME} - Finished UnPreDeploy on '${sgName}'`);
            return new UnPreDeployContext(ownServiceContext);
        });
}

exports.unBind = function (ownServiceContext) {
    let sgName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Executing UnBind on ${sgName}`);

    return deletePhasesCommon.unBindAllOnSg(sgName)
        .then(success => {
            winston.info(`${SERVICE_NAME} - Finished UnBind on ${sgName}`);
            return new UnBindContext(ownServiceContext);
        });
}

exports.unDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unDeployCloudFormationStack(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'securityGroups'
];

exports.consumedDeployOutputTypes = [];
