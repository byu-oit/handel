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
const DeployContext = require('../../datatypes/deploy-context');
const ProduceEventsContext = require('../../datatypes/produce-events-context');
const dynamoDb = require('../../aws/dynamodb-calls');

const KEY_TYPE_TO_ATTRIBUTE_TYPE = {
    String: "S",
    Number: "N"
}
const SERVICE_NAME = "DynamoDB";

const DEFAULT_CAPACITY_UNITS = 1;
const DEFAULT_AUTOSCALING_TARGET_UTILIZATION = 70;

function getTablePolicyForDependentServices(tableName, accountConfig) {
    let tableArn = buildTableARN(tableName, accountConfig);
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

function buildTableARN(tableName, accountConfig) {
    return `arn:aws:dynamodb:${accountConfig.region}:${accountConfig.account_id}:table/${tableName}`
}

function getLambdaConsumers(serviceContext) {
    let consumers = serviceContext.params.event_consumers;
    let lambdaConsumers = [];
    consumers.forEach((consumer) => {
        lambdaConsumers.push({
            serviceName: consumer.service_name,
            batchSize: consumer.batch_size
        })
    })
    return lambdaConsumers;
}

function getDeployContext(serviceContext, cfStack) {
    let deployContext = new DeployContext(serviceContext);
    let tableName = cloudFormationCalls.getOutput('TableName', cfStack);

    //Inject policies to talk to the table
    deployContext.policies.push(getTablePolicyForDependentServices(tableName, serviceContext.accountConfig));

    //Get values for createEventSourceMapping
    if (serviceContext.params.event_consumers) {
        deployContext.eventOutputs.tableName = tableName;
        deployContext.eventOutputs.tableStreamArn = cloudFormationCalls.getOutput('StreamArn', cfStack);
        deployContext.eventOutputs.lambdaConsumers = getLambdaConsumers(serviceContext);
    }

    //Inject env vars
    deployContext.addEnvironmentVariables(deployPhaseCommon.getInjectedEnvVarsFor(serviceContext, {
        TABLE_NAME: tableName
    }));

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
    if (config.provisioned_throughput && config.provisioned_throughput.read_capacity_units) {
        let parsed = parseThroughputCapacity(config.provisioned_throughput.read_capacity_units);
        console.log('-------- parsed: ', parsed);
        if (parsed.fixed) {
            return parsed.fixed;
        } else {
            return parsed.min;
        }
    }
    return DEFAULT_CAPACITY_UNITS;
}

function getWriteCapacityUnits(config) {
    if (config.provisioned_throughput && config.provisioned_throughput.write_capacity_units) {
        let parsed = parseThroughputCapacity(config.provisioned_throughput.write_capacity_units);
        console.log('-------- parsed: ', parsed);
        if (parsed.fixed) {
            return parsed.fixed;
        } else {
            return parsed.min;
        }
    }
    return DEFAULT_CAPACITY_UNITS;
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
    if (serviceParams.stream_view_type) {
        handlebarsParams.streamViewType = serviceParams.stream_view_type;
    }
    return handlebarsUtils.compileTemplate(`${__dirname}/dynamodb-template.yml`, handlebarsParams);
}

function getCompiledAutoscalingTemplate(mainStackName, ownServiceContext) {
    let serviceParams = ownServiceContext.params;

    let throughput = serviceParams.provisioned_throughput;

    let read = parseThroughputCapacity(throughput.read_capacity_units);
    let write = parseThroughputCapacity(throughput.write_capacity_units);

    read.target = throughput.read_target_utilization || DEFAULT_AUTOSCALING_TARGET_UTILIZATION;
    write.target = throughput.write_target_utilization || DEFAULT_AUTOSCALING_TARGET_UTILIZATION;

    let handlebarsParams = {
        tableName: mainStackName,
        read: read.fixed ? null : read,
        write: write.fixed ? null : write,
    };

    return handlebarsUtils.compileTemplate(`${__dirname}/dynamodb-autoscaling-template.yml`, handlebarsParams);
}

function parseThroughputCapacity(capacity) {
    if (!capacity) {
        return {fixed: DEFAULT_CAPACITY_UNITS};
    }
    let result = valid_throughput_pattern.exec(capacity);
    if (!result) {
        return {fixed: capacity};
    }
    let [_, min, max, ...rest] = result;
    if (!max) {
        return {fixed: capacity};
    }
    return {min, max};
}

const valid_throughput_pattern = /^(\d+)(?:-(\d+))?$/;

function checkProvisionedThroughput(throughput, errorPrefix) {
    if (!throughput) {
        return [];
    }

    let errors = [];

    let read = throughput.read_capacity_units;
    let write = throughput.write_capacity_units;
    let readTarget = throughput.read_target_utilization;
    let writeTarget = throughput.write_target_utilization;

    if (read && !valid_throughput_pattern.test(read)) {
        errors.push("'read_capacity_units' must be either a number or a numeric range (ex: 1-100)")
    }
    if (write && !valid_throughput_pattern.test(write)) {
        errors.push("'write_capacity_units' must be either a number or a numeric range (ex: 1-100)")
    }
    if (readTarget && !isValidTargetUtilization(readTarget)) {
        errors.push("'read_target_utilization' must be a number between 0 and 100");
    }
    if (writeTarget && !isValidTargetUtilization(writeTarget)) {
        errors.push("'write_target_utilization' must be a number between 0 and 100");
    }

    return errors.map(it => errorPrefix + it);
}

function isValidTargetUtilization(number) {
    return number > 0 && number <= 100
}


/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext, dependenciesServiceContexts) {
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

    //Check throughput
    errors.push(...checkProvisionedThroughput(params.provisioned_throughput, `${SERVICE_NAME} - `));

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
            errors.push(...checkProvisionedThroughput(globalIndexConfig.provisioned_throughput, `${SERVICE_NAME} - global_indexes - `))
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

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    var stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying table ${stackName}`);

    let stackTags = deployPhaseCommon.getTags(ownServiceContext)

    return getCompiledDynamoTemplate(stackName, ownServiceContext)
        .then(compiledTemplate => {
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], false, SERVICE_NAME, stackTags);
        })
        .then(deployedStack => {
            if (!hasAutoscaling(ownServiceContext)) {
                return deployedStack;
            }
            return getCompiledAutoscalingTemplate(stackName, ownServiceContext)
                .then(compiledTemplate => {
                    return deployPhaseCommon.deployCloudFormationStack(stackName + '-autoscaling', compiledTemplate, [], true, SERVICE_NAME, stackTags);
                }).then(() => deployedStack);
        })
        .then(deployedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying table ${stackName}`);
            return getDeployContext(ownServiceContext, deployedStack);
        });
};

function hasAutoscaling(ownServiceContext) {
    let params = ownServiceContext.params;
    if (params.provisioned_throughput) {
        let read = parseThroughputCapacity(params.provisioned_throughput.read_capacity_units);
        let write = parseThroughputCapacity(params.provisioned_throughput.write_capacity_units);

        //If both read and write have a fixed capacity, we don't have autoscaling
        return !read.fixed || !write.fixed;
    } else {
        return false;
    }
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.resolve(new ProduceEventsContext(ownServiceContext, consumerServiceContext));
}

exports.unDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [
    'lambda'
];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

exports.consumedDeployOutputTypes = [];
