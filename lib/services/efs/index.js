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
const handlebarsUtils = require('../../util/handlebars-utils');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../util/account-config')().getAccountConfig();
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployersCommon = require('../deployers-common');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');

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
            let mountDirEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'MOUNT_DIR');
            deployContext.environmentVariables[mountDirEnv] = mountDir
            deployContext.scripts.push(mountScript);
            return deployContext;
        });
}

function getFileSystemIdFromStack(stack) {
    let fileSystemId = cloudFormationCalls.getOutput('EFSFileSystemId', stack);
    if(fileSystemId) {
        return fileSystemId;
    }
    else {
        throw new Error("Couldn't find EFS file system ID in CloudFormation stack outputs");
    }
}

function getCompiledEfsTemplate(stackName, ownServiceContext, ownPreDeployContext) {
    let serviceParams = ownServiceContext.params;

    //Choose performance mode
    let performanceMode = "generalPurpose"; //Default
    if(serviceParams.performance_mode) {
        performanceMode = EFS_PERFORMANCE_MODE_MAP[serviceParams.performance_mode];
    }

    //Set up mount targets information
    let subnetIds = accountConfig['data_subnets'];
    let subnetAId = subnetIds[0]; //Default to using a single subnet for the ids (if they only provided one)
    let subnetBId = subnetIds[0];
    if(subnetIds.length > 1) { //Use multiple subnets if provided
        subnetBId = subnetIds[1]; 
    }
    let securityGroupId = ownPreDeployContext['securityGroups'][0].GroupId;

    let handlebarsParams = {
        fileSystemName: stackName,
        performanceMode,
        securityGroupId,
        subnetAId,
        subnetBId
    };

    //Inject tags (if any)
    if (serviceParams.tags) {
        handlebarsParams.tags = serviceParams.tags;
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/efs-template.yml`, handlebarsParams)
}


/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function(serviceContext) {
    let errors = [];
    let params = serviceContext.params;
    let perfModeParam = params['performance_mode']
    if(perfModeParam) {
        if(perfModeParam !== 'general_purpose' && perfModeParam !== 'max_io') {
            errors.push("EFS - 'performance_mode' parameter must be either 'general_purpose' or 'max_io'");
        }
    }
    return errors;
}

exports.preDeploy = function(serviceContext) {
    let sgName = deployersCommon.getResourceName(serviceContext);
    winston.info(`EFS - Executing PreDeploy on ${sgName}`);

    return deployersCommon.createSecurityGroupForService(sgName)
        .then(securityGroup => {
            winston.info(`EFS - Finished PreDeploy on ${sgName}`);
            let preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push(securityGroup);
            return preDeployContext;
        });
}

exports.bind = function(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`EFS - Executing Bind on ${stackName}`);
    let ownSg = ownPreDeployContext.securityGroups[0];
    let sourceSg = dependentOfPreDeployContext.securityGroups[0];

    return ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, ownSg, 
                                                  EFS_SG_PROTOCOL, EFS_PORT, 
                                                  EFS_PORT, accountConfig['vpc'])
        .then(efsSecurityGroup => {
            winston.info(`EFS - Finished Bind on ${stackName}`);
            return new BindContext(ownServiceContext, dependentOfServiceContext);
        });
}

exports.deploy = function(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`EFS - Executing Deploy on ${stackName}`);

    return cloudFormationCalls.getStack(stackName)
        .then(stack => {
            if(!stack) {
                winston.info(`EFS - Creating file system ${stackName}`);
                return getCompiledEfsTemplate(stackName, ownServiceContext, ownPreDeployContext)
                    .then(compiledTemplate => {
                        return cloudFormationCalls.createStack(stackName, compiledTemplate, [])
                            .then(createdStack => {
                                winston.info(`EFS - Created file system ${stackName}`)
                                let fileSystemId = getFileSystemIdFromStack(createdStack);
                                return getDeployContext(ownServiceContext, fileSystemId, accountConfig['region'], stackName);
                            });
                    });
            }
            else {
                winston.info(`EFS - Updates are not supported for this service`);
                let fileSystemId = getFileSystemIdFromStack(stack);
                return getDeployContext(ownServiceContext, fileSystemId, accountConfig['region'], stackName);
            }
        });
}

exports.consumeEvents = function(ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error("The EFS service doesn't consume events from other services"));
}

exports.produceEvents = function(ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error("The EFS service doesn't produce events for other services"));
}

exports.unPreDeploy = function (ownServiceContext) {
    let sgName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`EFS - Executing UnPreDeploy on ${sgName}`);

    return deployersCommon.deleteSecurityGroupForService(sgName)
        .then(success => {
            winston.info(`EFS - Finished UnPreDeploy on ${sgName}`);
            return new UnPreDeployContext(ownServiceContext);
        });
}

exports.unBind = function (ownServiceContext) {
    let sgName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`EFS - Executing UnBind on ${sgName}`);

    return deployersCommon.unBindAllOnSg(sgName)
        .then(success => {
            winston.info(`EFS - Finished UnBind on ${sgName}`);
            return new UnBindContext(ownServiceContext);
        });
}

exports.unDeploy = function (ownServiceContext) {
    return deployersCommon.unDeployCloudFormationStack(ownServiceContext, 'DynamoDB');
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'scripts',
    'securityGroups'
];

exports.consumedDeployOutputTypes = [];
