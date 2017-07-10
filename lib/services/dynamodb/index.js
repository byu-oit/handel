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
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../common/bind-phase-common');
const handlebarsUtils = require('../../common/handlebars-utils');
const accountConfig = require('../../common/account-config')().getAccountConfig();
const DeployContext = require('../../datatypes/deploy-context');

const KEY_TYPE_TO_ATTRIBUTE_TYPE = {
    String: "S",
    Number: "N"
}
const SERVICE_NAME = "DynamoDB";

function getTablePolicyForDependentServices(tableName) {
    let tableArn = buildTableARN(tableName);
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
            tableArn, //Grants access to the table itself
            `${tableArn}/index/*` //Grants access to any indexes the table may have
        ]
    }
}

function buildTableARN(tableName) {
    return `arn:aws:dynamodb:${accountConfig.region}:${accountConfig.account_id}:table/${tableName}`
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

function addDefinedAttribute(definedAttrs, attrName, attrType) {
    function definedAttrExists(definedAttrs, attrName) {
        for (let definedAttr of definedAttrs) {
            if (definedAttr.attributeName === attrName) {
                return true;
            }
        }
        return false;
    }

    if (!definedAttrExists(definedAttrs, attrName)) {
        definedAttrs.push({
            attributeName: attrName,
            attributeType: attrType
        });
    }
}

function getDefinedAttributes(ownServiceContext) {
    let serviceParams = ownServiceContext.params;

    let definedAttributes = [];

    //Add partition and sort keys from main table
    addDefinedAttribute(definedAttributes, serviceParams.partition_key.name, KEY_TYPE_TO_ATTRIBUTE_TYPE[serviceParams.partition_key.type]);
    if (serviceParams.sort_key) {
        addDefinedAttribute(definedAttributes, serviceParams.sort_key.name, KEY_TYPE_TO_ATTRIBUTE_TYPE[serviceParams.sort_key.type]);
    }

    //Add attributes from global indexes
    if (serviceParams.global_indexes) {
        for (let globalIndexConfig of serviceParams.global_indexes) {
            addDefinedAttribute(definedAttributes, globalIndexConfig.partition_key.name, KEY_TYPE_TO_ATTRIBUTE_TYPE[serviceParams.partition_key.type]);
            if (globalIndexConfig.sort_key) {
                addDefinedAttribute(definedAttributes, globalIndexConfig.sort_key.name, KEY_TYPE_TO_ATTRIBUTE_TYPE[globalIndexConfig.sort_key.type]);
            }
        }
    }

    //Add attributes from local indexes
    if (serviceParams.local_indexes) {
        for (let localIndexConfig of serviceParams.local_indexes) {
            addDefinedAttribute(definedAttributes, localIndexConfig.sort_key.name, KEY_TYPE_TO_ATTRIBUTE_TYPE[localIndexConfig.sort_key.type]);
        }
    }

    return definedAttributes;
}

function getReadCapacityUnits(config) {
    let indexReadCapacityUnits = 1;
    if (config.provisioned_throughput && config.provisioned_throughput.read_capacity_units) {
        indexReadCapacityUnits = config.provisioned_throughput.read_capacity_units;
    }
    return indexReadCapacityUnits;
}

function getWriteCapacityUnits(config) {
    let indexWriteCapacityUnits = 1;
    if (config.provisioned_throughput && config.provisioned_throughput.write_capacity_units) {
        indexWriteCapacityUnits = config.provisioned_throughput.write_capacity_units;
    }
    return indexWriteCapacityUnits;
}

function getGlobalIndexConfig(ownServiceContext) {
    let serviceParams = ownServiceContext.params;

    let handlebarsGlobalIndexes = [];

    for (let globalIndexConfig of serviceParams.global_indexes) {
        let handlebarsGlobalIndex = {
            indexName: globalIndexConfig.name,
            indexReadCapacityUnits: getReadCapacityUnits(globalIndexConfig),
            indexWriteCapacityUnits: getWriteCapacityUnits(globalIndexConfig),
            indexPartitionKeyName: globalIndexConfig.partition_key.name,
            indexProjectionAttributes: globalIndexConfig.attributes_to_copy
        };

        //Add sort key if provided
        if (globalIndexConfig.sort_key) {
            handlebarsGlobalIndex.indexSortKeyName = globalIndexConfig.sort_key.name
        }

        handlebarsGlobalIndexes.push(handlebarsGlobalIndex);
    }

    return handlebarsGlobalIndexes;
}

function getLocalIndexConfig(ownServiceContext) {
    let serviceParams = ownServiceContext.params;

    let handlebarsLocalIndexes = [];

    for (let localIndexConfig of serviceParams.local_indexes) {
        let handlebarsGlobalIndex = {
            indexName: localIndexConfig.name,
            indexPartitionKeyName: serviceParams.partition_key.name,
            indexSortKeyName: localIndexConfig.sort_key.name,
            indexProjectionAttributes: localIndexConfig.attributes_to_copy
        };

        handlebarsLocalIndexes.push(handlebarsGlobalIndex);
    }

    return handlebarsLocalIndexes;
}

function getCompiledDynamoTemplate(stackName, ownServiceContext) {
    let serviceParams = ownServiceContext.params;

    let handlebarsParams = {
        tableName: stackName,
        attributeDefinitions: getDefinedAttributes(ownServiceContext),
        tablePartitionKeyName: serviceParams.partition_key.name,
        tableReadCapacityUnits: getReadCapacityUnits(serviceParams),
        tableWriteCapacityUnits: getWriteCapacityUnits(serviceParams),
        tags: deployPhaseCommon.getTags(ownServiceContext)
    }

    //Add sort key if provided
    if (serviceParams.sort_key) {
        handlebarsParams.tableSortKeyName = serviceParams.sort_key.name;
    }

    if (serviceParams.global_indexes) {
        handlebarsParams.globalIndexes = getGlobalIndexConfig(ownServiceContext);
    }
    if (serviceParams.local_indexes) {
        handlebarsParams.localIndexes = getLocalIndexConfig(ownServiceContext);
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
        errors.push(`${SERVICE_NAME} - The 'partition_key' section is required`);
    }
    else {
        if (!params.partition_key.name) {
            errors.push(`${SERVICE_NAME} - The 'name' field in the 'partition_key' section is required`);
        }
        if (!params.partition_key.type) {
            errors.push(`${SERVICE_NAME} - The 'type' field in the 'partition_key' section is required`);
        }
    }

    //Check global indexes
    if (params.global_indexes) {
        for (let globalIndexConfig of params.global_indexes) {
            if (!globalIndexConfig.name) {
                errors.push(`${SERVICE_NAME} - The 'name' field is required in the 'global_indexes' section`);
            }

            if (!globalIndexConfig.partition_key) {
                errors.push(`${SERVICE_NAME} - The 'partition_key' section is required in the 'global_indexes' section`);
            }
            else {
                if (!globalIndexConfig.partition_key.name) {
                    errors.push(`${SERVICE_NAME} - The 'name' field in the 'partition_key' section is required in the 'global_indexes' section`);
                }
                if (!globalIndexConfig.partition_key.type) {
                    errors.push(`${SERVICE_NAME} - The 'type' field in the 'partition_key' section is required in the 'global_indexes' section`);
                }
            }
        }
    }

    //Check local indexes
    if (params.local_indexes) {
        for (let localIndexConfig of params.local_indexes) {
            if (!localIndexConfig.name) {
                errors.push(`${SERVICE_NAME} - The 'name' field is required in the 'local_indexes' section`);
            }

            if (!localIndexConfig.sort_key) {
                errors.push(`${SERVICE_NAME} - The 'sort_key' section is required in the 'local_indexes' section`);
            }
            else {
                if (!localIndexConfig.sort_key.name) {
                    errors.push(`${SERVICE_NAME} - The 'name' field in the 'sort_key' section is required in the 'local_indexes' section`);
                }
                if (!localIndexConfig.sort_key.type) {
                    errors.push(`${SERVICE_NAME} - The 'type' field in the 'sort_key' section is required in the 'local_indexes' section`);
                }
            }
        }
    }

    return errors;
}

exports.preDeploy = function (serviceContext) {
    return preDeployPhaseCommon.preDeployNotRequired(serviceContext, SERVICE_NAME);
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    return bindPhaseCommon.bindNotRequired(ownServiceContext, dependentOfServiceContext, SERVICE_NAME);
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    var stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying table ${stackName}`);

    return getCompiledDynamoTemplate(stackName, ownServiceContext)
        .then(compiledTemplate => {
            let stackTags = deployPhaseCommon.getTags(ownServiceContext)
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], false, SERVICE_NAME, stackTags);
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
    return deletePhasesCommon.unPreDeployNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.unBind = function (ownServiceContext) {
    return deletePhasesCommon.unBindNotRequired(ownServiceContext, SERVICE_NAME);
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