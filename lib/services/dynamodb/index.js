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
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const handlebarsUtils = require('../../common/handlebars-utils');
const accountConfig = require('../../common/account-config')().getAccountConfig();
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');

const KEY_TYPE_TO_ATTRIBUTE_TYPE = {
    String: "S",
    Number: "N"
}
const SERVICE_NAME = "DynamoDB";

function getTablePolicyForDependentServices(tableName) {
    return {
        "Effect": "Allow",
        "Action": [
            "dynamodb:BatchGetItem",
            "dynamodb:BatchWriteItem",
            "dynamodb:DeleteItem",
            "dynamodb:DescribeLimits",
            "dynamodb:DescribeReservedCapacity",
            "dynamodb:DescribeReservedCapacityOfferings",
            "dynamodb:DescribeStream",
            "dynamodb:DescribeTable",
            "dynamodb:GetItem",
            "dynamodb:GetRecords",
            "dynamodb:GetShardIterator",
            "dynamodb:ListStreams",
            "dynamodb:PutItem",
            "dynamodb:Query",
            "dynamodb:Scan",
            "dynamodb:UpdateItem"
        ],
        "Resource": [
            `arn:aws:dynamodb:${accountConfig.region}:${accountConfig.account_id}:table/${tableName}`
        ]
    }
}

function getDeployContext(serviceContext, cfStack) {
    let deployContext = new DeployContext(serviceContext);
    let tableName = cloudFormationCalls.getOutput('TableName', cfStack);

    //Inject policies to talk to the table
    deployContext.policies.push(getTablePolicyForDependentServices(tableName));

    //Inject env vars
    let tableNameEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, 'TABLE_NAME');
    deployContext.environmentVariables[tableNameEnv] = tableName;

    return deployContext;
}

function getCompiledDynamoTemplate(stackName, ownServiceContext) {
    let serviceParams = ownServiceContext.params;

    let readCapacityUnits = 1;
    if (serviceParams.provisioned_throughput && serviceParams.provisioned_throughput.read_capacity_units) {
        readCapacityUnits = serviceParams.provisioned_throughput.read_capacity_units;
    }
    let writeCapacityUnits = 1;
    if (serviceParams.provisioned_throughput && serviceParams.provisioned_throughput.write_capacity_units) {
        writeCapacityUnits = serviceParams.provisioned_throughput.write_capacity_units;
    }

    let handlebarsParams = {
        tableName: stackName,
        partitionKeyName: serviceParams.partition_key.name,
        partitionKeyType: KEY_TYPE_TO_ATTRIBUTE_TYPE[serviceParams.partition_key.type],
        readCapacityUnits,
        writeCapacityUnits
    }

    //Add sort key if provided
    if (serviceParams.sort_key) {
        handlebarsParams.sortKeyName = serviceParams.sort_key.name,
            handlebarsParams.sortKeyType = KEY_TYPE_TO_ATTRIBUTE_TYPE[serviceParams.sort_key.type]
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/dynamodb-template.yml`, handlebarsParams);
}


/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext) {
    let errors = [];
    let params = serviceContext.params;

    if (!params.partition_key) {
        errors.push(`${SERVICE_NAME} - partition_key section is required`);
    }
    else {
        if (!params.partition_key.name) {
            errors.push(`${SERVICE_NAME} - name field in partition_key is required`);
        }
        if (!params.partition_key.type) {
            errors.push(`${SERVICE_NAME} - type field in partition_key is required`);
        }
    }

    return errors;
}

exports.preDeploy = function (serviceContext) {
    winston.info(`${SERVICE_NAME} - PreDeploy not required for this service, skipping it`);
    return Promise.resolve(new PreDeployContext(serviceContext));
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`${SERVICE_NAME} - Bind not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    var stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying table ${stackName}`);

    return getCompiledDynamoTemplate(stackName, ownServiceContext)
        .then(compiledTemplate => {
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], false, SERVICE_NAME);
        })
        .then(deployedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying table ${stackName}`);
            return getDeployContext(ownServiceContext, deployedStack);
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't consume events from other services`));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't produce events for other services`));
}

exports.unPreDeploy = function (ownServiceContext) {
    winston.info(`${SERVICE_NAME} - UnPreDeploy is not required for this service`);
    return Promise.resolve(new UnPreDeployContext(ownServiceContext));
}

exports.unBind = function (ownServiceContext) {
    winston.info(`${SERVICE_NAME} - UnBind is not required for this service`);
    return Promise.resolve(new UnBindContext(ownServiceContext));
}

exports.unDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unDeployCloudFormationStack(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

exports.consumedDeployOutputTypes = [];