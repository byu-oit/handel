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
const AWS = require('aws-sdk');
const winston = require('winston');
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployersCommon = require('../../common/deployers-common');
const util = require('../../common/util');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const keyTypeToAttributeType = {
    String: "S",
    Number: "N"
}

function getTablePolicyForDependentServices(table) {
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
            table.TableArn
        ]
    }
}

function getDeployContext(serviceContext, table) {
    let deployContext = new DeployContext(serviceContext);
    deployContext.policies.push(getTablePolicyForDependentServices(table));

    let tableNameEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'TABLE_NAME');
    deployContext.environmentVariables[tableNameEnv] = table.TableName;
    let tableArnEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'TABLE_ARN');
    deployContext.environmentVariables[tableArnEnv] = table.TableArn;
    return deployContext;
}

function getTable(dynamodb, tableName) {
    winston.info(`Getting data for table ${tableName}`);
    let describeTableParams = {
        TableName: tableName
    };
    return dynamodb.describeTable(describeTableParams).promise()
        .then(tableData => { //Table exists
            return tableData.Table;
        })
        .catch(err => {
            if (err.statusCode === 400 && err.code === 'ResourceNotFoundException') {
                winston.info(`Table ${tableName} does not exist`);
                return null;
            }
            throw err; //Some other error happened
        });
}

function getCloudFormationStackParams(stackName, serviceParams) {
    let stackParams = {
        TableName: stackName,
        PartitionKeyName: serviceParams.partition_key.name,
        PartitionKeyType: keyTypeToAttributeType[serviceParams.partition_key.type]
    }

    //Add sort key if provided
    if (serviceParams.sort_key) {
        stackParams.SortKeyName = serviceParams.sort_key.name,
            stackParams.SortKeyType = keyTypeToAttributeType[serviceParams.sort_key.type]
    }

    //Add provisioned throughput if provided
    if (serviceParams.provisioned_throughput && serviceParams.provisioned_throughput.read_capacity_units) {
        stackParams.ReadCapacityUnits = serviceParams.provisioned_throughput.read_capacity_units.toString();
    }
    if (serviceParams.provisioned_throughput && serviceParams.provisioned_throughput.write_capacity_units) {
        stackParams.WriteCapacityUnits = serviceParams.provisioned_throughput.write_capacity_units.toString();
    }

    return cloudFormationCalls.getCfStyleStackParameters(stackParams)
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
        errors.push("DynamoDB - partition_key section is required");
    }
    else {
        if (!params.partition_key.name) {
            errors.push("DynamoDB - name field in partition_key is required");
        }
        if (!params.partition_key.type) {
            errors.push("DynamoDB - type field in partition_key is required");
        }
    }

    return errors;
}

exports.preDeploy = function (serviceContext) {
    winston.info(`DynamoDB - PreDeploy not required for this service, skipping it`);
    return Promise.resolve(new PreDeployContext(serviceContext));
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`DynamoDB - Bind not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    const dynamodb = new AWS.DynamoDB({ //I do this here because the aws-mock tool I use requires it
        apiVersion: '2012-08-10'
    });
    var stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`DynamoDB - Deploying table ${stackName}`);

    return cloudFormationCalls.getStack(stackName)
        .then(stack => {
            if (!stack) { //Create
                let dynamoTemplate = util.readFileSync(`${__dirname}/dynamodb.yml`);
                let stackParams = getCloudFormationStackParams(stackName, ownServiceContext.params);

                //Create the stack and return the table
                return cloudFormationCalls.createStack(stackName, dynamoTemplate, stackParams)
                    .then(createdStack => {
                        return getTable(dynamodb, stackName)
                            .then(table => {
                                winston.info(`DynamoDB - Finished deploying table ${stackName}`);
                                return getDeployContext(ownServiceContext, table);
                            });
                    });
            }
            else {
                winston.warn("DynamoDB - Updates not suported on DynamoDB");
                return getTable(dynamodb, stackName)
                    .then(table => {
                        return getDeployContext(ownServiceContext, table);
                    });
            }
        });
}

exports.consumeEvents  =  function (ownServiceContext,  ownDeployContext,  producerServiceContext,  producerDeployContext)  {
        return  Promise.reject(new Error("The DynamoDB service doesn't consume events from other services"));
}

exports.produceEvents  =  function (ownServiceContext,  ownDeployContext,  consumerServiceContext,  consumerDeployContext)  {
        return  Promise.reject(new Error("The DynamoDB service doesn't produce events for other services"));
}

exports.unPreDeploy = function (ownServiceContext) {
    winston.info(`DynamoDB - UnPreDeploy is not required for this service`);
    return Promise.resolve(new UnPreDeployContext(ownServiceContext));
}

exports.unBind = function (ownServiceContext) {
    winston.info(`DynamoDB - UnBind is not required for this service`);
    return Promise.resolve(new UnBindContext(ownServiceContext));
}

exports.unDeploy = function (ownServiceContext) {
    return deployersCommon.unDeployCloudFormationStack(ownServiceContext, 'DynamoDB');
}

exports.producedEventsSupportedServices  =  [];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

exports.consumedDeployOutputTypes = [];