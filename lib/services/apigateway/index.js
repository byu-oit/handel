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
const deletePhasesCommon = require('../../common/delete-phases-common');
const proxyPassthroughDeployType = require('./proxy/proxy-passthrough-deploy-type');
const swaggerDeployType = require('./swagger/swagger-deploy-type');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const lifecyclesCommon = require('../../common/lifecycles-common');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const SERVICE_NAME = "API Gateway";
const winston = require('winston');

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext, dependenciesServiceContexts) {
    let params = serviceContext.params;

    if(params.proxy) {
        return proxyPassthroughDeployType.check(serviceContext, dependenciesServiceContexts, SERVICE_NAME);
    }
    else if(params.swagger) {
        return swaggerDeployType.check(serviceContext, dependenciesServiceContexts, SERVICE_NAME);
    }
    else {
        winston.warn(`Top-level proxy configuration is deprecated. You should use the 'proxy' section instead`);
        return proxyPassthroughDeployType.check(serviceContext, dependenciesServiceContexts, SERVICE_NAME);
        // return [`${SERVICE_NAME} - You must specify either the 'proxy' or 'swagger' section`];
    }
}

exports.preDeploy = function (serviceContext) {
    if(serviceContext.params.vpc) {
        return preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
    } else {
        return lifecyclesCommon.preDeployNotRequired(serviceContext, SERVICE_NAME);
    }
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying API Gateway service '${stackName}'`);
    if(ownServiceContext.params.swagger) {
        return swaggerDeployType.deploy(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, SERVICE_NAME);
    }
    else {
        return proxyPassthroughDeployType.deploy(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, SERVICE_NAME);
    }
}

exports.unPreDeploy = function (ownServiceContext) {
    if(ownServiceContext.params.vpc) {
        return deletePhasesCommon.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME)
    } else {
        return lifecyclesCommon.unPreDeployNotRequired(ownServiceContext, SERVICE_NAME);
    }
}

exports.unDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [];

exports.consumedDeployOutputTypes = [
    'environmentVariables',
    'policies',
    'securityGroups'
];
