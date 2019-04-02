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
import { expect } from 'chai';
import * as clone from 'clone';
import {
    AccountConfig,
    DeployContext,
    PreDeployContext,
    ProduceEventsContext,
    ServiceContext,
    ServiceDeployer,
    ServiceType,
    UnDeployContext
} from 'handel-extension-api';
import {
    awsCalls,
    deletePhases,
    deployPhase,
    handlebars
} from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import { Service } from '../../../src/services/dynamodb';
import {
    DynamoDBConfig,
    DynamoDBServiceEventConsumer,
    KeyDataType,
    StreamViewType
} from '../../../src/services/dynamodb/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

const VALID_DYNAMODB_CONFIG: DynamoDBConfig = {
    type: 'dynamodb',
    table_name: 'my_example-table.name',
    partition_key: {
        name: 'MyPartitionKey',
        type: KeyDataType.String
    },
    sort_key: {
        name: 'MySortKey',
        type: KeyDataType.Number
    },
    provisioned_throughput: {
        read_capacity_units: '3',
        write_capacity_units: '3'
    },
    global_indexes: [{
        name: 'myglobal',
        partition_key: {
            name: 'MyPartitionKey',
            type: KeyDataType.String
        },
        sort_key: {
            name: 'MyGlobalSortKey',
            type: KeyDataType.String
        },
        attributes_to_copy: [
            'MyOtherGlobalAttribute'
        ],
        provisioned_throughput: {
            read_capacity_units: '2',
            write_capacity_units: '2'
        }
    }],
    local_indexes: [{
        name: 'mylocal',
        sort_key: {
            name: 'MyLocalSortKey',
            type: KeyDataType.String
        },
        attributes_to_copy: [
            'MyOtherLocalAttribute'
        ]
    }],
    stream_view_type: StreamViewType.NEW_AND_OLD_IMAGES,
    event_consumers: [{
        service_name: 'myFakeLambda',
        batch_size: 100
    }],
    tags: {
        name: 'MyTagName'
    }
};

describe('dynamodb deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceParams: DynamoDBConfig;
    let serviceContext: ServiceContext<DynamoDBConfig>;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    const serviceName = 'FakeService';
    const serviceType = 'dynamodb';
    let dynamodb: ServiceDeployer;

    beforeEach(async () => {
        dynamodb = new Service();
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.createSandbox();
        serviceParams = clone(VALID_DYNAMODB_CONFIG);
        serviceContext = new ServiceContext(appName, envName, serviceName, new ServiceType(STDLIB_PREFIX, serviceType), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should require a partition key section', () => {
            delete serviceParams.partition_key;
            const errors = dynamodb.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'partition_key\' section is required');
        });

        it('should require a name field in the partition_key', () => {
            delete serviceParams.partition_key.name;
            const errors = dynamodb.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'name\' field is required');
        });

        it('should require a type field in the partition_key', () => {
            delete serviceParams.partition_key.type;
            const errors = dynamodb.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'type\' field is required');
        });

        it('should require a name field for each global index', () => {
            delete serviceParams.global_indexes![0].name;
            const errors = dynamodb.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'name\' field is required');
        });

        it('should require the partition_key section in global indexes', () => {
            delete serviceParams.global_indexes![0].partition_key;
            const errors = dynamodb.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'partition_key\' section is required');
        });

        it('should require the name field in the partition_key for global indexes', () => {
            delete serviceParams.global_indexes![0].partition_key.name;
            const errors = dynamodb.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'name\' field is required');
        });

        it('should require the type field in the partition_key section for global indexes', () => {
            delete serviceParams.global_indexes![0].partition_key.type;
            const errors = dynamodb.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'type\' field is required');
        });

        it('should require a name field for each local index', () => {
            delete serviceParams.local_indexes![0].name;
            const errors = dynamodb.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'name\' field is required');
        });

        it('should require the sort_key section in local indexes', () => {
            delete serviceParams.local_indexes![0].sort_key;
            const errors = dynamodb.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'sort_key\' section is required');
        });

        it('should require the name field in the sort_key for local indexes', () => {
            delete serviceParams.local_indexes![0].sort_key.name;
            const errors = dynamodb.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'name\' field is required');
        });

        it('should require the type field in the sort_key section for local indexes', () => {
            delete serviceParams.local_indexes![0].sort_key.type;
            const errors = dynamodb.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'type\' field is required');
        });

        describe('table_name', () => {
            it('should validate that the name is at least 3 characters long', () => {
                serviceParams.table_name = 'a';

                const errors = dynamodb.check!(serviceContext, []);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include('between 3 and 255 characters');
            });
            it('should validate that the name is at most 255 characters long', () => {
                serviceParams.table_name = 'a'.repeat(256);

                const errors = dynamodb.check!(serviceContext, []);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include('between 3 and 255 characters');
            });
            it('should validate that the name has valid characters', () => {
                serviceParams.table_name = 'abc#def';

                const errors = dynamodb.check!(serviceContext, []);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include('alphanumeric characters, underscores (_), hyphens (-), and dots (.)');
            });
        });

        describe('provisioned_throughput', () => {
            it('should validate read_capacity_units', () => {
                serviceParams.provisioned_throughput!.read_capacity_units = 'abc';

                const errors = dynamodb.check!(serviceContext, []);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include('Must be either a number or a numeric range');
            });
            it('should allow numbers in read_capacity_units', () => {
                serviceParams.provisioned_throughput!.read_capacity_units = 1;

                const errors = dynamodb.check!(serviceContext, []);
                expect(errors.length).to.equal(0);
            });
            it('should allow ranges in read_capacity_units', () => {
                serviceParams.provisioned_throughput!.read_capacity_units = '1-100';

                const errors = dynamodb.check!(serviceContext, []);
                expect(errors.length).to.equal(0);
            });

            it('should validate write_capacity_units', () => {
                serviceParams.provisioned_throughput!.write_capacity_units = 'abc';

                const errors = dynamodb.check!(serviceContext, []);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include('Must be either a number or a numeric range');
            });
            it('should allow numbers in write_capacity_units', () => {
                serviceParams.provisioned_throughput!.write_capacity_units = 1;

                const errors = dynamodb.check!(serviceContext, []);
                expect(errors.length).to.equal(0);
            });
            it('should allow ranges in write_capacity_units', () => {
                serviceParams.provisioned_throughput!.write_capacity_units = '1-100';

                const errors = dynamodb.check!(serviceContext, []);
                expect(errors.length).to.equal(0);
            });
        });
    });

    describe('deploy', () => {
        it('should deploy the table', async () => {
            serviceContext.params = VALID_DYNAMODB_CONFIG;
            const ownPreDeployContext = new PreDeployContext(serviceContext);

            const tableName = 'FakeTable';
            const tableArn = `arn:aws:dynamodb:us-west-2:123456789012:table/${tableName}`;

            const deployStackStub = sandbox.stub(deployPhase, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [
                    {
                        OutputKey: 'TableName',
                        OutputValue: tableName
                    },
                    {
                        OutputKey: 'StreamArn',
                        OutputValue: 'FakeArn'
                    }
                ]
            }));

            const deployContext = await dynamodb.deploy!(serviceContext, ownPreDeployContext, []);
            expect(deployStackStub.callCount).to.equal(1);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.policies.length).to.equal(1);
            expect(deployContext.policies[0].Resource[0]).to.equal(tableArn);
            expect(deployContext.environmentVariables[`${serviceName}_TABLE_NAME`.toUpperCase()]).to.equal(tableName);
        });

        it('should allow the table name to be set', async () => {
            const ownPreDeployContext = new PreDeployContext(serviceContext);

            const tableName = 'MyFakeTable';
            const tableArn = `arn:aws:dynamodb:us-west-2:123456789012:table/${tableName}`;

            serviceParams.table_name = tableName;

            const deployStackStub = sandbox.stub(deployPhase, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [
                    {
                        OutputKey: 'TableName',
                        OutputValue: tableName
                    },
                    {
                        OutputKey: 'StreamArn',
                        OutputValue: 'FakeArn'
                    }
                ]
            }));

            const deployContext = await dynamodb.deploy!(serviceContext, ownPreDeployContext, []);
            expect(deployStackStub.callCount).to.equal(1);
            const call = deployStackStub.firstCall;
            expect(call.args[2]).to.include(`TableName: ${tableName}`);
        });

        describe('autoscaling', () => {
            let templateSpy: sinon.SinonSpy;
            let deployStackStub: sinon.SinonStub;
            let ownPreDeployContext: PreDeployContext;
            let dependenciesDeployContexts: DeployContext[];

            const fullTableName = 'FakeApp-FakeEnv-FakeService-dynamodb';

            beforeEach(() => {
                templateSpy = sandbox.spy(handlebars, 'compileTemplate');

                ownPreDeployContext = new PreDeployContext(serviceContext);
                dependenciesDeployContexts = [];

                const tableName = 'FakeTable';
                const tableArn = `arn:aws:dynamodb:us-west-2:123456789012:table/${tableName}`;

                deployStackStub = sandbox.stub(deployPhase, 'deployCloudFormationStack').returns(Promise.resolve({
                    Outputs: [
                        {
                            OutputKey: 'TableName',
                            OutputValue: fullTableName
                        },
                        {
                            OutputKey: 'StreamArn',
                            OutputValue: 'FakeArn'
                        }
                    ]
                }));
            });

            it('Should not set up autoscaling by default', async () => {
                serviceContext.params = clone(VALID_DYNAMODB_CONFIG);
                const deployContext = await dynamodb.deploy!(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
                // If it was only called once, we didn't deploy the autoscaling stack
                expect(deployStackStub.callCount).to.equal(1);
            });

            it('Should handle basic autoscaling', async () => {
                const serviceConfig = serviceContext.params = clone(VALID_DYNAMODB_CONFIG);
                serviceConfig.provisioned_throughput!.read_capacity_units = '1-10';
                serviceConfig.provisioned_throughput!.write_capacity_units = '2-5';
                serviceConfig.provisioned_throughput!.write_target_utilization = 99;

                const deployContext = await dynamodb.deploy!(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
                // If it was only called once, we didn't deploy the autoscaling stack
                expect(deployStackStub.callCount).to.equal(2);
                expect(templateSpy.callCount).to.equal(2);
                const tableParams = templateSpy.firstCall.args[1];
                const autoscaleParams = templateSpy.lastCall.args[1];

                expect(tableParams).to.have.property('tableReadCapacityUnits', 1);
                expect(tableParams).to.have.property('tableWriteCapacityUnits', 2);

                expect(autoscaleParams).to.have.property('targets')
                    .with.lengthOf(2);

                const targets = autoscaleParams.targets;

                expect(targets[0], 'table read target').to.include({
                    logicalIdPrefix: 'TableRead',
                    min: 1,
                    max: 10,
                    target: 70,
                    dimension: 'table:ReadCapacityUnits',
                    metric: 'DynamoDBReadCapacityUtilization',
                    resourceId: 'table/' + fullTableName
                });

                expect(targets[1], 'table write target').to.include({
                    logicalIdPrefix: 'TableWrite',
                    min: 2,
                    max: 5,
                    target: 99,
                    dimension: 'table:WriteCapacityUnits',
                    metric: 'DynamoDBWriteCapacityUtilization',
                    resourceId: 'table/' + fullTableName,
                    dependsOn: 'TableRead'
                });
            });

            it('global secondary indexes should default to match table autoscaling', async () => {
                const serviceConfig = serviceContext.params = clone(VALID_DYNAMODB_CONFIG);
                serviceConfig.provisioned_throughput!.read_capacity_units = '1-10';
                serviceConfig.provisioned_throughput!.write_capacity_units = '2-5';
                serviceConfig.provisioned_throughput!.write_target_utilization = 99;
                delete serviceConfig.global_indexes![0].provisioned_throughput;

                const deployContext = await dynamodb.deploy!(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
                // If it was only called once, we didn't deploy the autoscaling stack
                expect(deployStackStub.callCount).to.equal(2);
                expect(templateSpy.callCount).to.equal(2);
                const tableParams = templateSpy.firstCall.args[1];
                const autoscaleParams = templateSpy.lastCall.args[1];

                expect(tableParams).to.have.property('globalIndexes').which.has.lengthOf(1);
                expect(tableParams.globalIndexes[0]).to.have.property('indexReadCapacityUnits', 1);
                expect(tableParams.globalIndexes[0]).to.have.property('indexWriteCapacityUnits', 2);
                expect(tableParams).to.have.property('tableWriteCapacityUnits', 2);

                expect(autoscaleParams).to.have.property('targets')
                    .with.lengthOf(4);

                const targets = autoscaleParams.targets;

                expect(targets[2], 'index read target').to.deep.include({
                    logicalIdPrefix: 'IndexMyglobalRead',
                    min: 1,
                    max: 10,
                    target: 70,
                    dimension: 'index:ReadCapacityUnits',
                    metric: 'DynamoDBReadCapacityUtilization',
                    resourceId: 'table/' + fullTableName + '/index/myglobal',
                    dependsOn: 'TableWrite'
                });

                expect(targets[3], 'index write target').to.deep.include({
                    logicalIdPrefix: 'IndexMyglobalWrite',
                    min: 2,
                    max: 5,
                    target: 99,
                    dimension: 'index:WriteCapacityUnits',
                    metric: 'DynamoDBWriteCapacityUtilization',
                    resourceId: 'table/' + fullTableName + '/index/myglobal',
                    dependsOn: 'IndexMyglobalRead'
                });
            });

            it('global secondary indexes should be independently configurable', async () => {
                const serviceConfig = serviceContext.params = clone(VALID_DYNAMODB_CONFIG);
                const globalConfig = serviceConfig.global_indexes![0];
                globalConfig.provisioned_throughput!.read_capacity_units = '1-10';
                globalConfig.provisioned_throughput!.write_capacity_units = '2-5';
                globalConfig.provisioned_throughput!.write_target_utilization = 99;

                const deployContext = await dynamodb.deploy!(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
                // If it was only called once, we didn't deploy the autoscaling stack
                expect(deployStackStub.callCount).to.equal(2);
                expect(templateSpy.callCount).to.equal(2);
                const tableParams = templateSpy.firstCall.args[1];
                const autoscaleParams = templateSpy.lastCall.args[1];

                expect(tableParams).to.have.property('tableReadCapacityUnits', 3);
                expect(tableParams).to.have.property('tableWriteCapacityUnits', 3);

                expect(tableParams).to.have.property('globalIndexes').which.has.lengthOf(1);
                expect(tableParams.globalIndexes[0]).to.have.property('indexReadCapacityUnits', 1);
                expect(tableParams.globalIndexes[0]).to.have.property('indexWriteCapacityUnits', 2);
                expect(tableParams).to.have.property('tableWriteCapacityUnits', 3);

                expect(autoscaleParams).to.have.property('targets').which.has.lengthOf(2);

                const targets = autoscaleParams.targets;

                expect(targets[0], 'index read target').to.deep.include({
                    logicalIdPrefix: 'IndexMyglobalRead',
                    min: 1,
                    max: 10,
                    target: 70,
                    dimension: 'index:ReadCapacityUnits',
                    metric: 'DynamoDBReadCapacityUtilization',
                    resourceId: 'table/' + fullTableName + '/index/myglobal',
                });

                expect(targets[1], 'index write target').to.deep.include({
                    logicalIdPrefix: 'IndexMyglobalWrite',
                    min: 2,
                    max: 5,
                    target: 99,
                    dimension: 'index:WriteCapacityUnits',
                    metric: 'DynamoDBWriteCapacityUtilization',
                    resourceId: 'table/' + fullTableName + '/index/myglobal',
                    dependsOn: 'IndexMyglobalRead'
                });
            });

            // https://github.com/byu-oit/handel/issues/517
            it('should handle custom table names properly (Issue 517)', async () => {
                const customName = 'customName';
                const serviceConfig = serviceContext.params = clone(VALID_DYNAMODB_CONFIG);

                serviceConfig.table_name = customName;

                serviceConfig.provisioned_throughput!.read_capacity_units = '1-10';
                serviceConfig.provisioned_throughput!.write_capacity_units = '2-5';
                serviceConfig.provisioned_throughput!.write_target_utilization = 99;
                delete serviceConfig.global_indexes![0].provisioned_throughput;

                deployStackStub.returns(Promise.resolve({
                    Outputs: [
                        {
                            OutputKey: 'TableName',
                            OutputValue: customName
                        },
                        {
                            OutputKey: 'StreamArn',
                            OutputValue: 'FakeArn'
                        }
                    ]
                }));

                const deployContext = await dynamodb.deploy!(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
                // If it was only called once, we didn't deploy the autoscaling stack
                const autoscaleParams = templateSpy.lastCall.args[1];

                expect(autoscaleParams).to.have.property('targets')
                    .with.lengthOf(4);

                const targets = autoscaleParams.targets;

                expect(targets[2], 'index read target').to.deep.include({
                    logicalIdPrefix: 'IndexMyglobalRead',
                    min: 1,
                    max: 10,
                    target: 70,
                    dimension: 'index:ReadCapacityUnits',
                    metric: 'DynamoDBReadCapacityUtilization',
                    resourceId: 'table/' + customName + '/index/myglobal',
                    dependsOn: 'TableWrite'
                });

                expect(targets[3], 'index write target').to.deep.include({
                    logicalIdPrefix: 'IndexMyglobalWrite',
                    min: 2,
                    max: 5,
                    target: 99,
                    dimension: 'index:WriteCapacityUnits',
                    metric: 'DynamoDBWriteCapacityUtilization',
                    resourceId: 'table/' + customName + '/index/myglobal',
                    dependsOn: 'IndexMyglobalRead'
                });
            });
        });
    });

    describe('produceEvents', () => {
        it('should return an empty ProduceEventsContext', async () => {
            const consumerServiceContext = new ServiceContext(appName, envName, 'fakeservice', new ServiceType(STDLIB_PREFIX, 'faketype'), {type: 'faketype'}, accountConfig);
            const eventConsumerConfig: DynamoDBServiceEventConsumer = {
                service_name: 'fakeservice',
                batch_size: 1
            };
            const produceEventsContext = await dynamodb.produceEvents!(serviceContext, new DeployContext(serviceContext), eventConsumerConfig, consumerServiceContext, new DeployContext(consumerServiceContext));
            expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const getStackStub = sandbox.stub(awsCalls.cloudFormation, 'getStack').returns(Promise.resolve(null));
            const unDeployStackStub = sandbox.stub(deletePhases, 'unDeployService').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            const unDeployContext = await dynamodb.unDeploy!(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
