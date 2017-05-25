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
const handlebarsUtils = require('../../common/handlebars-utils');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const accountConfig = require('../../common/account-config')().getAccountConfig();
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployersCommon = require('../../common/deployers-common');
const rdsCommon = require('../../common/rds-common');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const uuid = require('uuid');

const POSTGRES_PORT = 5432;
const POSTGRES_PROTOCOL = 'tcp';

function getParameterGroupFamily(postgresVersion) {
    if (postgresVersion.startsWith('9.3')) {
        return 'postgres9.3';
    }
    else if (postgresVersion.startsWith('9.4')) {
        return 'postgres9.4';
    }
    else if (postgresVersion.startsWith('9.5')) {
        return 'postgres9.5';
    }
    else {
        return 'postgres9.6';
    }
}

function getCompiledPostgresTemplate(stackName, ownServiceContext, ownPreDeployContext) {
    let serviceParams = ownServiceContext.params;

    let dbSecurityGroupId = ownPreDeployContext['securityGroups'][0].GroupId;
    let instanceType = serviceParams.instance_type || 'db.t2.micro';
    let storageGB = serviceParams.storage_gb || 5;
    let databaseName = serviceParams.database_name;
    let dbSubnetGroup = accountConfig.rds_subnet_group;
    let postgresVersion = serviceParams.postgres_version || '9.6.2';
    let dbUsername = serviceParams.db_username || 'handel';
    let storageType = serviceParams.storage_type || 'standard';

    let handlebarsParams = {
        storageGB,
        instanceType,
        stackName,
        databaseName,
        dbSubnetGroup,
        postgresVersion,
        dbUsername,
        dbPort: POSTGRES_PORT,
        storageType,
        dbSecurityGroupId,
        parameterGroupFamily: getParameterGroupFamily(postgresVersion)
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

    return handlebarsUtils.compileTemplate(`${__dirname}/postgresql-template.yml`, handlebarsParams)
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
        errors.push(`PostgreSQL - The 'database_name' parameter is required`);
    }

    return errors;
}

exports.preDeploy = function (serviceContext) {
    let sgName = deployersCommon.getResourceName(serviceContext);
    winston.info(`PostgreSQL - Executing PreDeploy on ${sgName}`);

    return deployersCommon.createSecurityGroupForService(sgName, POSTGRES_PORT)
        .then(securityGroup => {
            winston.info(`PostgreSQL - Finished PreDeploy on ${sgName}`);
            let preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push(securityGroup);
            return preDeployContext;
        });
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`PostgreSQL - Executing Bind on ${stackName}`);
    let ownSg = ownPreDeployContext.securityGroups[0];
    let sourceSg = dependentOfPreDeployContext.securityGroups[0];

    return ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, ownSg,
        POSTGRES_PROTOCOL, POSTGRES_PORT,
        POSTGRES_PORT, accountConfig['vpc'])
        .then(postgresSecurityGroup => {
            winston.info(`PostgreSQL - Finished Bind on ${stackName}`);
            return new BindContext(ownServiceContext, dependentOfServiceContext);
        });
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`PostgreSQL - Executing Deploy on ${stackName}`);

    return getCompiledPostgresTemplate(stackName, ownServiceContext, ownPreDeployContext)
        .then(compiledTemplate => {
            return cloudFormationCalls.getStack(stackName)
                .then(stack => {
                    if (!stack) {
                        let dbPassword = uuid();
                        let cfParameters = {
                            DBPassword: dbPassword
                        }
                        winston.info(`PostgreSQL - Creating RDS instances '${stackName}'`);
                        return cloudFormationCalls.createStack(stackName, compiledTemplate, cloudFormationCalls.getCfStyleStackParameters(cfParameters))
                            .then(deployedStack => {
                                return rdsCommon.addDbCredentialToParameterStore(ownServiceContext, dbPassword, deployedStack);
                            });
                    }
                    else {
                        winston.info(`PostgreSQL - Updates are not supported for this service.`);
                        return stack;
                    }
                });
        })
        .then(deployedStack => {
            winston.info(`PostgreSQL - Finished deploying RDS instance '${stackName}'`)
            return rdsCommon.getDeployContext(ownServiceContext, deployedStack);
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error("The PostgreSQL service doesn't consume events from other services"));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error("The PostgreSQL service doesn't produce events for other services"));
}

exports.unPreDeploy = function (ownServiceContext) {
    let sgName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`PostgreSQL - Executing UnPreDeploy on ${sgName}`);

    return deployersCommon.deleteSecurityGroupForService(sgName)
        .then(success => {
            winston.info(`PostgreSQL - Finished UnPreDeploy on ${sgName}`);
            return new UnPreDeployContext(ownServiceContext);
        });
}

exports.unBind = function (ownServiceContext) {
    let sgName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`PostgreSQL - Executing UnBind on ${sgName}`);

    return deployersCommon.unBindAllOnSg(sgName)
        .then(success => {
            winston.info(`PostgreSQL - Finished UnBind on ${sgName}`);
            return new UnBindContext(ownServiceContext);
        });
}

exports.unDeploy = function (ownServiceContext) {
    return deployersCommon.unDeployCloudFormationStack(ownServiceContext, 'PostgreSQL')
        .then(unDeployContext => {
            return rdsCommon.deleteParametersFromParameterStore(ownServiceContext, unDeployContext);
        });
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'scripts',
    'securityGroups'
];

exports.consumedDeployOutputTypes = [];
