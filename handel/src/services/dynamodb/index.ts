/*
 * Copyright 2018 Brigham Young University
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
import { CloudFormation } from 'aws-sdk';
import {
    AccountConfig,
    DeployContext,
    DeployOutputType,
    PreDeployContext,
    ProduceEventsContext,
    ServiceConfig,
    ServiceContext,
    ServiceDeployer,
    ServiceEventConsumer,
    ServiceEventType,
    UnDeployContext
} from 'handel-extension-api';
import { awsCalls, checkPhase, deletePhases, deployPhase, handlebars, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import * as autoscaling from './autoscaling';
import { CapacityMode, DEFAULT_CAPACITY_MODE, DynamoDBConfig } from './config-types';

const KEY_TYPE_TO_ATTRIBUTE_TYPE: any = {
    String: 'S',
    string: 'S',
    Number: 'N',
    number: 'N'
};

const SERVICE_NAME = 'DynamoDB';

function getTablePolicyForDependentServices(tableName: string, accountConfig: AccountConfig) {
    const tableArn = buildTableARN(tableName, accountConfig);
    return {
        'Effect': 'Allow',
        'Action': [
            'dynamodb:BatchGetItem',
            'dynamodb:BatchWriteItem',
            'dynamodb:DeleteItem',
            'dynamodb:DescribeLimits',
            'dynamodb:DescribeReservedCapacity',
            'dynamodb:DescribeReservedCapacityOfferings',
            'dynamodb:DescribeStream',
            'dynamodb:DescribeTable',
            'dynamodb:GetItem',
            'dynamodb:GetRecords',
            'dynamodb:GetShardIterator',
            'dynamodb:ListStreams',
            'dynamodb:PutItem',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:UpdateItem'
        ],
        'Resource': [
            tableArn, // Grants access to the table itself
            `${tableArn}/index/*` // Grants access to any indexes the table may have
        ]
    };
}

function buildTableARN(tableName: string, accountConfig: AccountConfig) {
    return `arn:aws:dynamodb:${accountConfig.region}:${accountConfig.account_id}:table/${tableName}`;
}

function getDeployContext(serviceContext: ServiceContext<DynamoDBConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    const deployContext = new DeployContext(serviceContext);
    const tableName = getTableNameFrom(cfStack);
    if (!tableName) {
        throw new Error('Expected to receive TableName back from DynamoDB service');
    }

    // Inject policies to talk to the table
    deployContext.policies.push(getTablePolicyForDependentServices(tableName!, serviceContext.accountConfig));

    // Get values for createEventSourceMapping
    if (serviceContext.params.event_consumers) {
        const tableStreamArn = awsCalls.cloudFormation.getOutput('StreamArn', cfStack);
        if (!tableStreamArn) {
            throw new Error('Expected to receive StreamArn back from DynamoDB service');
        }
        deployContext.eventOutputs = {
            resourceArn: tableStreamArn,
            resourceName: tableName,
            resourcePrincipal: 'dynamodb.amazonaws.com',
            serviceEventType: ServiceEventType.DynamoDB
        };
    }

    // Inject env vars
    deployContext.addEnvironmentVariables({
        TABLE_NAME: tableName
    });

    return deployContext;
}

function getTableNameFrom(stack: CloudFormation.Stack): string {
    return awsCalls.cloudFormation.getOutput('TableName', stack)!;
}

function addDefinedAttribute(definedAttrs: any[], attrName: string, attrType: string) {
    function definedAttrExists(definedAttrsList: any[], attrNameToCheck: string) {
        for (const definedAttr of definedAttrsList) {
            if (definedAttr.attributeName === attrNameToCheck) {
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

function getDefinedAttributes(ownServiceContext: ServiceContext<DynamoDBConfig>) {
    const serviceParams = ownServiceContext.params;

    const definedAttributes: any[] = [];

    // Add partition and sort keys from main table
    addDefinedAttribute(definedAttributes, serviceParams.partition_key.name, KEY_TYPE_TO_ATTRIBUTE_TYPE[serviceParams.partition_key.type]);
    if (serviceParams.sort_key) {
        addDefinedAttribute(definedAttributes, serviceParams.sort_key.name, KEY_TYPE_TO_ATTRIBUTE_TYPE[serviceParams.sort_key.type]);
    }

    // Add attributes from global indexes
    if (serviceParams.global_indexes) {
        for (const globalIndexConfig of serviceParams.global_indexes) {
            addDefinedAttribute(definedAttributes, globalIndexConfig.partition_key.name, KEY_TYPE_TO_ATTRIBUTE_TYPE[globalIndexConfig.partition_key.type]);
            if (globalIndexConfig.sort_key) {
                addDefinedAttribute(definedAttributes, globalIndexConfig.sort_key.name, KEY_TYPE_TO_ATTRIBUTE_TYPE[globalIndexConfig.sort_key.type]);
            }
        }
    }

    // Add attributes from local indexes
    if (serviceParams.local_indexes) {
        for (const localIndexConfig of serviceParams.local_indexes) {
            addDefinedAttribute(definedAttributes, localIndexConfig.sort_key.name, KEY_TYPE_TO_ATTRIBUTE_TYPE[localIndexConfig.sort_key.type]);
        }
    }

    return definedAttributes;
}

function getGlobalIndexConfig(ownServiceContext: ServiceContext<DynamoDBConfig>, capacityMode: CapacityMode, tableThroughputConfig: autoscaling.ThroughputConfig) {
    const serviceParams = ownServiceContext.params;

    const handlebarsGlobalIndexes = [];

    if (serviceParams.global_indexes) {
        for (const globalIndexConfig of serviceParams.global_indexes) {
            const throughput = autoscaling.getThroughputConfig(globalIndexConfig.provisioned_throughput, tableThroughputConfig);

            const handlebarsGlobalIndex: any = {
                indexName: globalIndexConfig.name,
                indexPartitionKeyName: globalIndexConfig.partition_key.name,
                indexProjectionAttributes: globalIndexConfig.attributes_to_copy
            };

            if (capacityMode === CapacityMode.PROVISIONED) {
                handlebarsGlobalIndex.throughput = {
                    readUnits: throughput.read.initial,
                    writeUnits: throughput.write.initial,
                };
            }

            // Add sort key if provided
            if (globalIndexConfig.sort_key) {
                handlebarsGlobalIndex.indexSortKeyName = globalIndexConfig.sort_key.name;
            }

            handlebarsGlobalIndexes.push(handlebarsGlobalIndex);
        }
    }

    return handlebarsGlobalIndexes;
}

function getLocalIndexConfig(ownServiceContext: ServiceContext<DynamoDBConfig>) {
    const serviceParams = ownServiceContext.params;

    const handlebarsLocalIndexes = [];

    if (serviceParams.local_indexes) {
        for (const localIndexConfig of serviceParams.local_indexes) {
            const handlebarsGlobalIndex = {
                indexName: localIndexConfig.name,
                indexPartitionKeyName: serviceParams.partition_key.name,
                indexSortKeyName: localIndexConfig.sort_key.name,
                indexProjectionAttributes: localIndexConfig.attributes_to_copy
            };

            handlebarsLocalIndexes.push(handlebarsGlobalIndex);
        }
    }

    return handlebarsLocalIndexes;
}

const capacityToBillingMode = {
    [CapacityMode.PROVISIONED]: 'PROVISIONED',
    [CapacityMode.ON_DEMAND]: 'PAY_PER_REQUEST'
};

async function getCompiledDynamoTemplate(stackName: string, ownServiceContext: ServiceContext<DynamoDBConfig>): Promise<string> {
    const serviceParams = ownServiceContext.params;

    const capacityMode = serviceParams.capacity_mode || DEFAULT_CAPACITY_MODE;

    const throughputConfig = autoscaling.getThroughputConfig(serviceParams.provisioned_throughput, null);

    const handlebarsParams: any = {
        tableName: serviceParams.table_name || stackName,
        attributeDefinitions: getDefinedAttributes(ownServiceContext),
        tablePartitionKeyName: serviceParams.partition_key.name,
        billingMode: capacityToBillingMode[capacityMode],
        tableReadCapacityUnits: throughputConfig.read.initial,
        tableWriteCapacityUnits: throughputConfig.write.initial,
        ttlAttribute: serviceParams.ttl_attribute,
        tags: tagging.getTags(ownServiceContext)
    };

    if (capacityMode === CapacityMode.PROVISIONED) {
        handlebarsParams.throughput = {
            readUnits: throughputConfig.read.initial,
            writeUnits: throughputConfig.write.initial,
        };
    }

    // Add sort key if provided
    if (serviceParams.sort_key) {
        handlebarsParams.tableSortKeyName = serviceParams.sort_key.name;
    }

    if (serviceParams.global_indexes) {
        handlebarsParams.globalIndexes = getGlobalIndexConfig(ownServiceContext, capacityMode, throughputConfig);
    }
    if (serviceParams.local_indexes) {
        handlebarsParams.localIndexes = getLocalIndexConfig(ownServiceContext);
    }
    if (serviceParams.stream_view_type) {
        handlebarsParams.streamViewType = serviceParams.stream_view_type;
    }
    return handlebars.compileTemplate(`${__dirname}/dynamodb-template.yml`, handlebarsParams);
}

export class Service implements ServiceDeployer {
    public readonly producedDeployOutputTypes = [
        DeployOutputType.EnvironmentVariables,
        DeployOutputType.Policies
    ];
    public readonly consumedDeployOutputTypes = [];
    public readonly supportsTagging = true;
    public readonly providedEventType = ServiceEventType.DynamoDB;
    public readonly producedEventsSupportedTypes = [
        ServiceEventType.Lambda
    ];

    public check(serviceContext: ServiceContext<DynamoDBConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
        const errors = checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);

        const params = serviceContext.params;

        if ((params.capacity_mode || DEFAULT_CAPACITY_MODE) === CapacityMode.ON_DEMAND) {
            if (params.provisioned_throughput) {
                errors.push(`[${SERVICE_NAME}] 'provisioned_throughput' must not be set if 'capacity_mode' is set to '${CapacityMode.ON_DEMAND}'.`);
            }
            if (params.global_indexes && params.global_indexes.find(it => !!it.provisioned_throughput)) {
                errors.push(`[${SERVICE_NAME}] 'global_indexes.provisioned_throughput' must not be set if 'capacity_mode' is set to '${CapacityMode.ON_DEMAND}'.`);
            }
        }

        return errors;
    }

    public async deploy(ownServiceContext: ServiceContext<DynamoDBConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
        const stackName = ownServiceContext.stackName();
        winston.info(`${SERVICE_NAME} - Deploying table ${stackName}`);

        const stackTags = tagging.getTags(ownServiceContext);

        const compiledTemplate = await getCompiledDynamoTemplate(stackName, ownServiceContext);
        const deployedStack = await deployPhase.deployCloudFormationStack(ownServiceContext, stackName, compiledTemplate, [], false, 30, stackTags);
        await autoscaling.deployAutoscaling(getTableNameFrom(deployedStack), ownServiceContext, SERVICE_NAME, stackTags);
        winston.info(`${SERVICE_NAME} - Finished deploying table ${stackName}`);
        return getDeployContext(ownServiceContext, deployedStack);
    }

    public async produceEvents(ownServiceContext: ServiceContext<DynamoDBConfig>, ownDeployContext: DeployContext, eventConsumerConfig: ServiceEventConsumer, consumerServiceContext: ServiceContext<ServiceConfig>, consumerDeployContext: DeployContext): Promise<ProduceEventsContext> {
        return new ProduceEventsContext(ownServiceContext, consumerServiceContext);
    }

    public async unDeploy(ownServiceContext: ServiceContext<DynamoDBConfig>): Promise<UnDeployContext> {
        await autoscaling.undeployAutoscaling(ownServiceContext);
        return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
    }
}
