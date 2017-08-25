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
const handlebarsUtils = require('../../common/handlebars-utils');
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../common/account-config')().getAccountConfig();
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../common/bind-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');

const SERVICE_NAME = "EFS";
const EFS_PORT = 2049;
const EFS_SG_PROTOCOL = "tcp";
const EFS_PERFORMANCE_MODE_MAP = {
    "general_purpose": "generalPurpose",
    "max_io": "maxIO"
}

function getMountScript(fileSystemId, region, mountDir) {
    let variables = { //TODO - REPLACE THIS WITH SOMETHING ELSE
        "EFS_FILE_SYSTEM_ID": fileSystemId,
        "EFS_REGION": region,
        "EFS_MOUNT_DIR": mountDir
    }
    return handlebarsUtils.compileTemplate(`${__dirname}/mount-script-template.sh`, variables)
        .then(mountScript => {
            return mountScript;
        });
}

function getDeployContext(serviceContext, fileSystemId, region, fileSystemName) {
    let deployContext = new DeployContext(serviceContext);

    let mountDir = `/mnt/share/${fileSystemName}`
    return getMountScript(fileSystemId, region, mountDir)
        .then(mountScript => {
            let mountDirEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, 'MOUNT_DIR');
            deployContext.environmentVariables[mountDirEnv] = mountDir
            deployContext.scripts.push(mountScript);
            return deployContext;
        });
}

function getFileSystemIdFromStack(stack) {
    let fileSystemId = cloudFormationCalls.getOutput('EFSFileSystemId', stack);
    if (fileSystemId) {
        return fileSystemId;
    }
    else {
        throw new Error(`Couldn't find ${SERVICE_NAME} file system ID in CloudFormation stack outputs`);
    }
}

function getCompiledEfsTemplate(stackName, ownServiceContext, ownPreDeployContext) {
    let serviceParams = ownServiceContext.params;

    //Choose performance mode
    let performanceMode = "generalPurpose"; //Default
    if (serviceParams.performance_mode) {
        performanceMode = EFS_PERFORMANCE_MODE_MAP[serviceParams.performance_mode];
    }

    //Set up mount targets information
    let subnetIds = accountConfig['data_subnets'];
    let subnetAId = subnetIds[0]; //Default to using a single subnet for the ids (if they only provided one)
    let subnetBId = subnetIds[0];
    if (subnetIds.length > 1) { //Use multiple subnets if provided
        subnetBId = subnetIds[1];
    }
    let securityGroupId = ownPreDeployContext['securityGroups'][0].GroupId;

    let handlebarsParams = {
        fileSystemName: stackName,
        performanceMode,
        securityGroupId,
        subnetAId,
        subnetBId,
        tags: deployPhaseCommon.getTags(ownServiceContext)
    };

    return handlebarsUtils.compileTemplate(`${__dirname}/efs-template.yml`, handlebarsParams)
}


/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext, dependenciesServiceContexts) {
    let errors = [];
    let params = serviceContext.params;
    let perfModeParam = params['performance_mode']
    if (perfModeParam) {
        if (perfModeParam !== 'general_purpose' && perfModeParam !== 'max_io') {
            errors.push(`${SERVICE_NAME} - 'performance_mode' parameter must be either 'general_purpose' or 'max_io'`);
        }
    }
    return errors;
}

exports.preDeploy = function (serviceContext) {
    return preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    return bindPhaseCommon.bindDependentSecurityGroupToSelf(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, EFS_SG_PROTOCOL, EFS_PORT, SERVICE_NAME);
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying EFS mount '${stackName}'`);

    return getCompiledEfsTemplate(stackName, ownServiceContext, ownPreDeployContext)
        .then(compiledTemplate => {
            let stackTags = deployPhaseCommon.getTags(ownServiceContext);
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], false, SERVICE_NAME, stackTags);
        })
        .then(deployedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying EFS mount '${stackName}'`)
            let fileSystemId = getFileSystemIdFromStack(deployedStack);
            return getDeployContext(ownServiceContext, fileSystemId, accountConfig['region'], stackName);
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
    'scripts',
    'securityGroups'
];

exports.consumedDeployOutputTypes = [];
