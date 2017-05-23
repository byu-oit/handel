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
const ssmCalls = require('../../aws/ssm-calls');
const handlebarsUtils = require('../../common/handlebars-utils');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../common/account-config')().getAccountConfig();
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployersCommon = require('../../common/deployers-common');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const uuid = require('uuid');

const MYSQL_PORT = 3306;
const MYSQL_PROTOCOL = 'tcp';

function getDeployContext(serviceContext, cfStack) {
    let deployContext = new DeployContext(serviceContext);

    //Inject ENV variables to talk to this database
    let portEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'ADDRESS');
    let port = cloudFormationCalls.getOutput('DatabaseAddress', cfStack);
    deployContext.environmentVariables[portEnv] = port;
    let addressEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'PORT');
    let address = cloudFormationCalls.getOutput('DatabasePort', cfStack);
    deployContext.environmentVariables[addressEnv] = address;
    let usernameEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'USERNAME');
    let username = cloudFormationCalls.getOutput('DatabaseUsername', cfStack);
    deployContext.environmentVariables[usernameEnv] = username;
    let dbNameEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'DATABASE_NAME');
    let dbName = cloudFormationCalls.getOutput('DatabaseName', cfStack);
    deployContext.environmentVariables[dbNameEnv] = dbName;

    return deployContext;
}

function getParameterGroupFamily(mysqlVersion) {
    if(mysqlVersion.startsWith('5.5')) {
        return 'mysql5.5';
    }
    else if(mysqlVersion.startsWith('5.6')) {
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
    if(serviceParams.db_parameters) {
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

    if(!serviceParams.database_name) {
        errors.push(`MySQL - The 'database_name' parameter is required`);
    }

    return errors;
}

exports.preDeploy = function (serviceContext) {
    let sgName = deployersCommon.getResourceName(serviceContext);
    winston.info(`MySQL - Executing PreDeploy on ${sgName}`);

    return deployersCommon.createSecurityGroupForService(sgName, 3306)
        .then(securityGroup => {
            winston.info(`MySQL - Finished PreDeploy on ${sgName}`);
            let preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push(securityGroup);
            return preDeployContext;
        });
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`MySQL - Executing Bind on ${stackName}`);
    let ownSg = ownPreDeployContext.securityGroups[0];
    let sourceSg = dependentOfPreDeployContext.securityGroups[0];

    return ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, ownSg,
        MYSQL_PROTOCOL, MYSQL_PORT,
        MYSQL_PORT, accountConfig['vpc'])
        .then(mysqlSecurityGroup => {
            winston.info(`MySQL - Finished Bind on ${stackName}`);
            return new BindContext(ownServiceContext, dependentOfServiceContext);
        });
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`MySQL - Executing Deploy on ${stackName}`);

    return getCompiledMysqlTemplate(stackName, ownServiceContext, ownPreDeployContext)
        .then(compiledTemplate => {
            return cloudFormationCalls.getStack(stackName)
                .then(stack => {
                    if (!stack) {
                        let dbPassword = uuid().substring(0, 32);
                        let cfParameters = {
                            DBPassword: dbPassword
                        }
                        winston.info(`MySQL - Creating RDS instances '${stackName}'`);
                        return cloudFormationCalls.createStack(stackName, compiledTemplate, cloudFormationCalls.getCfStyleStackParameters(cfParameters))
                            .then(deployedStack => {
                                //Add credential to EC2 Parameter Store
                                let credentialParamName = deployersCommon.getSsmParamName(ownServiceContext, "db_password");
                                return ssmCalls.storeParameter(credentialParamName, 'SecureString', dbPassword)
                                    .then(() => {
                                        return deployedStack;
                                    });
                            });
                    }
                    else {
                        winston.info(`MySQL - Updates are not supported for this service.`);
                        return stack;
                    }
                });
        })
        .then(deployedStack => {
            winston.info(`MySQL - Finished deploying RDS instance '${stackName}'`)
            return getDeployContext(ownServiceContext, deployedStack);
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error("The MySQL service doesn't consume events from other services"));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error("The MySQL service doesn't produce events for other services"));
}

exports.unPreDeploy = function (ownServiceContext) {
    let sgName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`MySQL - Executing UnPreDeploy on ${sgName}`);

    return deployersCommon.deleteSecurityGroupForService(sgName)
        .then(success => {
            winston.info(`MySQL - Finished UnPreDeploy on ${sgName}`);
            return new UnPreDeployContext(ownServiceContext);
        });
}

exports.unBind = function (ownServiceContext) {
    let sgName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`MySQL - Executing UnBind on ${sgName}`);

    return deployersCommon.unBindAllOnSg(sgName)
        .then(success => {
            winston.info(`MySQL - Finished UnBind on ${sgName}`);
            return new UnBindContext(ownServiceContext);
        });
}

exports.unDeploy = function (ownServiceContext) {
    return deployersCommon.unDeployCloudFormationStack(ownServiceContext, 'MySQL')
        .then(upDeployContext => {
            let paramsToDelete = [
                deployersCommon.getSsmParamName(ownServiceContext, "db_password")
            ]
            return ssmCalls.deleteParameters(paramsToDelete)
                .then(() => {
                    return upDeployContext;
                });
        });
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'scripts',
    'securityGroups'
];

exports.consumedDeployOutputTypes = [];
