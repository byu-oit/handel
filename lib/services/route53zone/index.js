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
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const handlebarsUtils = require('../../common/handlebars-utils');
const route53 = require('../../aws/route53-calls');

const SERVICE_NAME = "Route53";

function getDeployContext(serviceContext, cfStack) {
    let name = cloudFormationCalls.getOutput('ZoneName', cfStack);
    let id = cloudFormationCalls.getOutput('ZoneId', cfStack);
    let nameServers = cloudFormationCalls.getOutput('ZoneNameServers', cfStack);

    let deployContext = new DeployContext(serviceContext);

    //Env variables to inject into consuming services
    let zoneNameEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, 'ZONE_NAME');
    deployContext.environmentVariables[zoneNameEnv] = name;
    let zoneIdEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, "ZONE_ID");
    deployContext.environmentVariables[zoneIdEnv] = id;
    let zoneNameServersEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, "ZONE_NAME_SERVERS");
    deployContext.environmentVariables[zoneNameServersEnv] = nameServers;

    return deployContext;
}


function getCompiledRoute53Template(ownServiceContext) {
    let serviceParams = ownServiceContext.params;
    let accountConfig = ownServiceContext.accountConfig;

    let handlebarsParams = {
        name: serviceParams.name,
        tags: deployPhaseCommon.getTags(ownServiceContext)
    };

    if (serviceParams.private) {
        handlebarsParams.vpcs = [{
            id: accountConfig.vpc,
            region: accountConfig.region
        }];
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/route53zone-template.yml`, handlebarsParams)
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext, dependenciesServiceContexts) {
    let errors = [];

    let params = serviceContext.params;

    if (!params.name) {
        errors.push(`${SERVICE_NAME} - 'name' parameter must be specified`);
    } else if (!route53.isValidHostname(params.name)) {
        errors.push(`${SERVICE_NAME} - 'name' parameter must be a valid hostname`);
    }

    if (params.private && typeof params.private !== 'boolean') {
        errors.push(`${SERVICE_NAME} - 'private' parameter must be 'true' or 'false'`);
    }

    return errors;
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying Route53 Zone ${stackName}`);

    return getCompiledRoute53Template(ownServiceContext)
        .then(compiledTemplate => {
            let stackTags = deployPhaseCommon.getTags(ownServiceContext);
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME, stackTags);
        })
        .then(createdOrUpdatedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying S3 bucket ${stackName}`);
            return getDeployContext(ownServiceContext, createdOrUpdatedStack);
        });
}

exports.unDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'environmentVariables'
];

exports.consumedDeployOutputTypes = [];
