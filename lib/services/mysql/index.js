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
const accountConfig = require('../../common/account-config')().getAccountConfig();
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../common/bind-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const rdsCommon = require('../../common/rds-common');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const uuid = require('uuid');

const SERVICE_NAME = "MySQL";
const MYSQL_PORT = 3306;
const MYSQL_PROTOCOL = 'tcp';

function getParameterGroupFamily(mysqlVersion) {
    if (mysqlVersion.startsWith('5.5')) {
        return 'mysql5.5';
    }
    else if (mysqlVersion.startsWith('5.6')) {
        return 'mysql5.6';
    }
    else {
        return 'mysql5.7';
    }
}

function getCompiledMysqlTemplate(stackName, ownServiceContext, ownPreDeployContext) {
    let serviceParams = ownServiceContext.params;

    let dbSecurityGroupId = ownPreDeployContext['securityGroups'][0].GroupId;
    let instanceType = serviceParams.instance_type || 'db.t2.micro';
    let storageGB = serviceParams.storage_gb || 5;
    let databaseName = serviceParams.database_name;
    let dbSubnetGroup = accountConfig.rds_subnet_group;
    let mysqlVersion = serviceParams.mysql_version || '5.6.27';
    let dbUsername = serviceParams.db_username || 'handel';
    let storageType = serviceParams.storage_type || 'standard';

    let handlebarsParams = {
        storageGB,
        instanceType,
        stackName,
        databaseName,
        dbSubnetGroup,
        mysqlVersion,
        dbUsername,
        dbPort: MYSQL_PORT,
        storageType,
        dbSecurityGroupId,
        parameterGroupFamily: getParameterGroupFamily(mysqlVersion)
    };

    //Add parameters to parameter group if specified
    if (serviceParams.db_parameters) {
        handlebarsParams.parameterGroupParams = serviceParams.db_parameters;
    }

    //Set multiAZ if user-specified
    if (serviceParams.multi_az) {
        handlebarsParams.multi_az = true;
    }

    //Add tags (if present)
    if (serviceParams.tags) {
        handlebarsParams.tags = serviceParams.tags;
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/mysql-template.yml`, handlebarsParams)
}


/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext) {
    let errors = [];
    let serviceParams = serviceContext.params;

    if (!serviceParams.database_name) {
        errors.push(`${SERVICE_NAME} - The 'database_name' parameter is required`);
    }

    return errors;
}

exports.preDeploy = function (serviceContext) {
    return preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, MYSQL_PORT, SERVICE_NAME);
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    return bindPhaseCommon.bindDependentSecurityGroupToSelf(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, MYSQL_PROTOCOL, MYSQL_PORT, SERVICE_NAME);
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Executing Deploy on ${stackName}`);

    return getCompiledMysqlTemplate(stackName, ownServiceContext, ownPreDeployContext)
        .then(compiledTemplate => {
            return cloudFormationCalls.getStack(stackName)
                .then(stack => {
                    if (!stack) {
                        let dbPassword = uuid().substring(0, 32);
                        let cfParameters = {
                            DBPassword: dbPassword
                        }
                        winston.info(`${SERVICE_NAME} - Creating RDS instances '${stackName}'`);
                        return cloudFormationCalls.createStack(stackName, compiledTemplate, cloudFormationCalls.getCfStyleStackParameters(cfParameters))
                            .then(deployedStack => {
                                return rdsCommon.addDbCredentialToParameterStore(ownServiceContext, dbPassword, deployedStack);
                            });
                    }
                    else {
                        winston.info(`${SERVICE_NAME} - Updates are not supported for this service.`);
                        return stack;
                    }
                });
        })
        .then(deployedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying RDS instance '${stackName}'`)
            return rdsCommon.getDeployContext(ownServiceContext, deployedStack);
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't consume events from other services`));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't produce events for other services`));
}

exports.unPreDeploy = function (ownServiceContext) {
    let sgName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Executing UnPreDeploy on ${sgName}`);

    return deletePhasesCommon.deleteSecurityGroupForService(sgName)
        .then(success => {
            winston.info(`${SERVICE_NAME} - Finished UnPreDeploy on ${sgName}`);
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
    return deletePhasesCommon.unDeployCloudFormationStack(ownServiceContext, SERVICE_NAME)
        .then(unDeployContext => {
            return rdsCommon.deleteParametersFromParameterStore(ownServiceContext, unDeployContext)
        });
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'scripts',
    'securityGroups'
];

exports.consumedDeployOutputTypes = [];
