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
const DeployContext = require('../../datatypes/deploy-context').DeployContext;
const ProduceEventsContext = require('../../datatypes/produce-events-context').ProduceEventsContext;
const normalizeLogicalId = require('../../common/util').normalizeLogicalId;

const KEY_TYPE_TO_ATTRIBUTE_TYPE = {
    String: "S",
    Number: "N"
};

const SCALING_TYPES = {
    READ: 'READ',
    WRITE: 'WRITE'
};

const SCALING_LOGICAL_ID_SUFFIXES = {
    READ: 'Read',
    WRITE: 'Write'
};

const SCALING_TARGET_TYPES = {
    TABLE: 'table',
    INDEX: 'index'
};

const SCALING_DIMENSION_UNITS = {
    READ: 'ReadCapacityUnits',
    WRITE: 'WriteCapacityUnits'
};

const SCALING_METRIC_TYPES = {
    READ: 'DynamoDBReadCapacityUtilization',
    WRITE: 'DynamoDBWriteCapacityUtilization'
};

const SERVICE_NAME = "DynamoDB";

const DEFAULT_CAPACITY_UNITS = '1';
const DEFAULT_AUTOSCALING_TARGET_UTILIZATION = '70';

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
    });
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

function tableOrIndexesHaveAutoscaling(ownServiceContext) {
    let params = ownServiceContext.params;
    if (params.provisioned_throughput) {
        if (provisionedThroughputHasAutoscaling(params.provisioned_throughput)) {
            return true;
        }
    }

    if (params.global_indexes) {
        for (let idx of params.global_indexes) {
            if (provisionedThroughputHasAutoscaling(idx.provisioned_throughput)) {
                return true;
            }
        }
    }

    return false;
}

function provisionedThroughputHasAutoscaling(provisionedThroughput) {
    if (!provisionedThroughput) {
        return false;
    }
    let read = parseThroughputCapacity(provisionedThroughput.read_capacity_units);
    let write = parseThroughputCapacity(provisionedThroughput.write_capacity_units);

    return read.scaled || write.scaled;
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

function getGlobalIndexConfig(ownServiceContext, tableThroughputConfig) {
    let serviceParams = ownServiceContext.params;

    let handlebarsGlobalIndexes = [];

    for (let globalIndexConfig of serviceParams.global_indexes) {
        let throughput = getThroughputConfig(globalIndexConfig.provisioned_throughput, tableThroughputConfig);

        let handlebarsGlobalIndex = {
            indexName: globalIndexConfig.name,
            indexReadCapacityUnits: throughput.read.initial,
            indexWriteCapacityUnits: throughput.write.initial,
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

    let throughputConfig = getThroughputConfig(serviceParams.provisioned_throughput, null);

    let handlebarsParams = {
        tableName: stackName,
        attributeDefinitions: getDefinedAttributes(ownServiceContext),
        tablePartitionKeyName: serviceParams.partition_key.name,
        tableReadCapacityUnits: throughputConfig.read.initial,
        tableWriteCapacityUnits: throughputConfig.write.initial,
        tags: deployPhaseCommon.getTags(ownServiceContext)
    };

    //Add sort key if provided
    if (serviceParams.sort_key) {
        handlebarsParams.tableSortKeyName = serviceParams.sort_key.name;
    }

    if (serviceParams.global_indexes) {
        handlebarsParams.globalIndexes = getGlobalIndexConfig(ownServiceContext, throughputConfig);
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

    let tableName = mainStackName;

    let handlebarsParams = {
        tableName,
        targets: getScalingTargets(serviceParams, tableName)
    };

    return handlebarsUtils.compileTemplate(`${__dirname}/dynamodb-autoscaling-template.yml`, handlebarsParams);
}

function getScalingTargets(serviceParams, tableName) {
    let configs = [];

    let tableThroughput = getThroughputConfig(serviceParams.provisioned_throughput, null);

    configs.push(...extractScalingTargets(tableThroughput, SCALING_TARGET_TYPES.TABLE, 'Table', 'table/' + tableName));

    if (serviceParams.global_indexes) {
        let indexConfigs = serviceParams.global_indexes
            .map(config => {
                let throughput = getThroughputConfig(config.provisioned_throughput, tableThroughput);
                let idxName = config.name;
                return extractScalingTargets(
                    throughput,
                    SCALING_TARGET_TYPES.INDEX,
                    'Index' + normalizeLogicalId(idxName),
                    'table/' + tableName + '/index/' + idxName
                );
            }).reduce((acc, cur) => {
                return acc.concat(cur);
            }, []);
        configs.push(...indexConfigs);
    }

    configs.forEach((each, idx, array) => {
        if (idx === 0) {
            return;
        }
        let prev = array[idx - 1];
        each.dependsOn = prev.logicalIdPrefix;
    });

    return configs;
}


function extractScalingTargets(throughputConfig, targetType, logicalIdPrefix, resourceId) {
    let configs = [];
    if (throughputConfig.read.scaled) {
        configs.push(getScalingConfig(throughputConfig.read, SCALING_TYPES.READ, logicalIdPrefix, targetType, resourceId));
    }
    if (throughputConfig.write.scaled) {
        configs.push(getScalingConfig(throughputConfig.write, SCALING_TYPES.WRITE, logicalIdPrefix, targetType, resourceId));
    }
    return configs;
}

function getScalingConfig(config, scalingType, logicalIdPrefix, targetType, resourceId) {
    return new AutoscalingDefinition(
        logicalIdPrefix + SCALING_LOGICAL_ID_SUFFIXES[scalingType],
        config.min,
        config.max,
        config.target,
        targetType + ':' + SCALING_DIMENSION_UNITS[scalingType],
        SCALING_METRIC_TYPES[scalingType],
        resourceId
    );
}

class AutoscalingDefinition {
    constructor(logicalIdPrefix, min, max, target, dimension, metric, resourceId) {
        this.logicalIdPrefix = logicalIdPrefix;
        this.min = min;
        this.max = max;
        this.target = target;
        this.dimension = dimension;
        this.metric = metric;
        this.resourceId = resourceId;
        this.dependsOn = null;
    }
}

function getThroughputConfig(throughputConfig, defaultConfig) {
    let throughput = throughputConfig || {};
    let defaults = defaultConfig || {};
    let defaultRead = defaults.read || {};
    let defaultWrite = defaults.write || {};

    let read = assembleThroughputConfig(
        throughput.read_capacity_units,
        throughput.read_target_utilization,
        defaultRead
    );

    let write = assembleThroughputConfig(
        throughput.write_capacity_units,
        throughput.write_target_utilization,
        defaultWrite
    );

    return {read, write};
}

function assembleThroughputConfig(capacity, targetUtilization, defaultConfig) {
    let result = {};
    if (capacity) {
        Object.assign(result, parseThroughputCapacity(capacity));
        result.target = String(targetUtilization || defaultConfig.throughput || DEFAULT_AUTOSCALING_TARGET_UTILIZATION);
    } else {
        Object.assign(
            result,
            {initial: DEFAULT_CAPACITY_UNITS, target: DEFAULT_AUTOSCALING_TARGET_UTILIZATION, scaled: false},
            defaultConfig
        );
    }
    return result;
}


function parseThroughputCapacity(capacity) {
    if (!capacity) {
        return {initial: DEFAULT_CAPACITY_UNITS, scaled: false};
    }
    let result = valid_throughput_pattern.exec(capacity);
    if (!result) {
        return {initial: capacity, scaled: false};
    }
    let [, min, max] = result;
    if (!max) {
        return {initial: capacity, scaled: false};
    }
    return {initial: min, min, max, scaled: true};
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

function getAutoscalingStackName(ownServiceContext) {
    return deployPhaseCommon.getResourceName(ownServiceContext) + '-autoscaling';
}

function undeployAutoscaling(ownServiceContext) {
    let stackName = getAutoscalingStackName(ownServiceContext);
    return cloudFormationCalls.getStack(stackName).then(result => {
        if (result) {
            return cloudFormationCalls.deleteStack(stackName);
        }
    });
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
            if (!tableOrIndexesHaveAutoscaling(ownServiceContext)) {
                return deployedStack;
            }
            return getCompiledAutoscalingTemplate(stackName, ownServiceContext)
                .then(compiledTemplate => {
                    return deployPhaseCommon.deployCloudFormationStack(getAutoscalingStackName(ownServiceContext), compiledTemplate, [], true, SERVICE_NAME, stackTags);
                }).then(() => deployedStack);
        })
        .then(deployedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying table ${stackName}`);
            return getDeployContext(ownServiceContext, deployedStack);
        });
};

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.resolve(new ProduceEventsContext(ownServiceContext, consumerServiceContext));
}

exports.unDeploy = function (ownServiceContext) {
    return undeployAutoscaling(ownServiceContext)
        .then(() => {
            return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
        });
}

exports.producedEventsSupportedServices = [
    'lambda'
];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

exports.consumedDeployOutputTypes = [];
