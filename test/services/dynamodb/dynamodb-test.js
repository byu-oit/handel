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
const dynamodb = require('../../../dist/services/dynamodb');
const ServiceContext = require('../../../dist/datatypes/service-context').ServiceContext;
const DeployContext = require('../../../dist/datatypes/deploy-context').DeployContext;
const PreDeployContext = require('../../../dist/datatypes/pre-deploy-context').PreDeployContext;
const deployPhaseCommon = require('../../../dist/common/deploy-phase-common');
const deletePhasesCommon = require('../../../dist/common/delete-phases-common');
const UnDeployContext = require('../../../dist/datatypes/un-deploy-context').UnDeployContext;
const ProduceEventsContext = require('../../../dist/datatypes/produce-events-context').ProduceEventsContext;
const handlebarsUtils = require('../../../dist/common/handlebars-utils');
const cloudformationCalls = require('../../../dist/aws/cloudformation-calls');
const clone = require('clone');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../../dist/account-config/account-config');

const VALID_DYNAMODB_CONFIG = {
    partition_key: {
        name: "MyPartitionKey",
        type: "String"
    },
    sort_key: {
        name: "MySortKey",
        type: "Number"
    },
    provisioned_throughput: {
        read_capacity_units: "3",
        write_capacity_units: "3"
    },
    global_indexes: [{
        name: "myglobal",
        partition_key: {
            name: "MyPartitionKey",
            type: "String"
        },
        sort_key: {
            name: "MyGlobalSortKey",
            type: "String"
        },
        attributes_to_copy: [
            "MyOtherGlobalAttribute"
        ],
        provisioned_throughput: {
            read_capacity_units: 2,
            write_capacity_units: 2
        }
    }],
    local_indexes: [{
        name: "mylocal",
        sort_key: {
            name: "MyLocalSortKey",
            type: "String"
        },
        attributes_to_copy: [
            "MyOtherLocalAttribute"
        ]
    }],
    stream_view_type: "NEW_AND_OLD_IMAGES",
    event_consumers: [{
        service_name: "myFakeLambda",
        batch_size: 100
    }],
    tags: {
        name: "MyTagName"
    }
}

describe('dynamodb deployer', function () {
    let sandbox;
    let serviceContext;
    let appName = "FakeApp";
    let envName = "FakeEnv";
    let serviceName = "FakeService";
    let serviceType = "dynamodb";

    beforeEach(function () {
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext(appName, envName, serviceName, serviceType, {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        let configToCheck;

        beforeEach(function () {
            configToCheck = clone(VALID_DYNAMODB_CONFIG);
            serviceContext.params = configToCheck;
        });

        it('should require a partition key section', function () {
            delete configToCheck.partition_key;
            let errors = dynamodb.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'partition_key' section is required");
        });

        it('should require a name field in the partition_key', function () {
            delete configToCheck.partition_key.name;
            let errors = dynamodb.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'name' field in the 'partition_key' section is required");
        });

        it('should require a type field in the partition_key', function () {
            delete configToCheck.partition_key.type;
            let errors = dynamodb.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'type' field in the 'partition_key' section is required");
        });

        it('should require a name field for each global index', function () {
            delete configToCheck.global_indexes[0].name;
            let errors = dynamodb.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'name' field is required in the 'global_indexes' section");
        });

        it('should require the partition_key section in global indexes', function () {
            delete configToCheck.global_indexes[0].partition_key;
            let errors = dynamodb.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'partition_key' section is required in the 'global_indexes' section");
        });

        it('should require the name field in the partition_key for global indexes', function () {
            delete configToCheck.global_indexes[0].partition_key.name;
            let errors = dynamodb.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'name' field in the 'partition_key' section is required in the 'global_indexes' section");
        });

        it('should require the type field in the partition_key section for global indexes', function () {
            delete configToCheck.global_indexes[0].partition_key.type;
            let errors = dynamodb.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'type' field in the 'partition_key' section is required in the 'global_indexes' section");
        });

        it('should require a name field for each local index', function () {
            delete configToCheck.local_indexes[0].name;
            let errors = dynamodb.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'name' field is required in the 'local_indexes' section");
        });

        it('should require the sort_key section in local indexes', function () {
            delete configToCheck.local_indexes[0].sort_key;
            let errors = dynamodb.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'sort_key' section is required in the 'local_indexes' section");
        });

        it('should require the name field in the sort_key for local indexes', function () {
            delete configToCheck.local_indexes[0].sort_key.name;
            let errors = dynamodb.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'name' field in the 'sort_key' section is required in the 'local_indexes' section");
        });

        it('should require the type field in the sort_key section for local indexes', function () {
            delete configToCheck.local_indexes[0].sort_key.type;
            let errors = dynamodb.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'type' field in the 'sort_key' section is required in the 'local_indexes' section");
        });

        describe('provisioned_throughput', function () {
            it('should validate read_capacity_units', function () {
                configToCheck.provisioned_throughput = {
                    read_capacity_units: 'abc'
                };

                let errors = dynamodb.check(serviceContext);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include("'read_capacity_units' must be either a number or a numeric range")
            });
            it('should allow numbers in read_capacity_units', function () {
                configToCheck.provisioned_throughput = {
                    read_capacity_units: 1
                };

                let errors = dynamodb.check(serviceContext);
                expect(errors).to.be.empty;
            });
            it('should allow ranges in read_capacity_units', function () {
                configToCheck.provisioned_throughput = {
                    read_capacity_units: '1-100'
                };

                let errors = dynamodb.check(serviceContext);
                expect(errors).to.be.empty;
            });


            it('should validate write_capacity_units', function () {
                configToCheck.provisioned_throughput = {
                    write_capacity_units: 'abc'
                };

                let errors = dynamodb.check(serviceContext);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include("'write_capacity_units' must be either a number or a numeric range")
            });
            it('should allow numbers in write_capacity_units', function () {
                configToCheck.provisioned_throughput = {
                    write_capacity_units: 1
                };

                let errors = dynamodb.check(serviceContext);
                expect(errors).to.be.empty;
            });
            it('should allow ranges in write_capacity_units', function () {
                configToCheck.provisioned_throughput = {
                    write_capacity_units: '1-100'
                };

                let errors = dynamodb.check(serviceContext);
                expect(errors).to.be.empty;
            });

            it('should require read_target_utilization to be a number', function () {
                configToCheck.provisioned_throughput = {
                    read_capacity_units: '1-100',
                    read_target_utilization: 'a'
                };

                let errors = dynamodb.check(serviceContext);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include("'read_target_utilization' must be a number");
            });

            it('should require write_target_utilization to be a number', function () {
                configToCheck.provisioned_throughput = {
                    write_capacity_units: '1-100',
                    write_target_utilization: 'a'
                };

                let errors = dynamodb.check(serviceContext);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include("'write_target_utilization' must be a number");
            });
        });
    });

    describe('deploy', function () {
        it('should deploy the table', function () {
            serviceContext.params = VALID_DYNAMODB_CONFIG;
            let ownPreDeployContext = new PreDeployContext(serviceContext);
            let dependenciesDeployContexts = [];

            let tableName = "FakeTable";
            let tableArn = `arn:aws:dynamodb:us-west-2:123456789012:table/${tableName}`

            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'TableName',
                    OutputValue: tableName
                }]
            }));
            return dynamodb.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployStackStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.policies.length).to.equal(1);
                    expect(deployContext.policies[0].Resource[0]).to.equal(tableArn);
                    expect(deployContext.environmentVariables[`${serviceName}_TABLE_NAME`.toUpperCase()]).to.equal(tableName);
                });
        });

        describe("autoscaling", function () {
            let templateSpy;
            let deployStackStub;
            let ownPreDeployContext;
            let dependenciesDeployContexts;

            let fullTableName = 'FakeApp-FakeEnv-FakeService-dynamodb';

            beforeEach(function () {
                templateSpy = sandbox.spy(handlebarsUtils, 'compileTemplate');

                ownPreDeployContext = new PreDeployContext(serviceContext);
                dependenciesDeployContexts = [];

                let tableName = "FakeTable";
                let tableArn = `arn:aws:dynamodb:us-west-2:123456789012:table/${tableName}`

                deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                    Outputs: [{
                        OutputKey: 'TableName',
                        OutputValue: tableName
                    }]
                }));
            });

            it("Should not set up autoscaling by default", function () {
                serviceContext.params = clone(VALID_DYNAMODB_CONFIG);
                return dynamodb.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts)
                    .then(deployContext => {
                        //If it was only called once, we didn't deploy the autoscaling stack
                        expect(deployStackStub.calledOnce).to.be.true;
                    });
            });

            it("Should handle basic autoscaling", function () {
                let config = serviceContext.params = clone(VALID_DYNAMODB_CONFIG);
                config.provisioned_throughput.read_capacity_units = '1-10';
                config.provisioned_throughput.write_capacity_units = '2-5';
                config.provisioned_throughput.write_target_utilization = 99;

                return dynamodb.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts)
                    .then(deployContext => {
                        //If it was only called once, we didn't deploy the autoscaling stack
                        expect(deployStackStub.calledTwice).to.be.true;
                        expect(templateSpy.calledTwice).to.be.true;
                        let tableParams = templateSpy.firstCall.args[1];
                        let autoscaleParams = templateSpy.lastCall.args[1];

                        expect(tableParams).to.have.property('tableReadCapacityUnits', '1');
                        expect(tableParams).to.have.property('tableWriteCapacityUnits', '2');

                        expect(autoscaleParams).to.have.property('targets')
                            .with.lengthOf(2);

                        let targets = autoscaleParams.targets;

                        expect(targets[0], 'table read target').to.include({
                            logicalIdPrefix: 'TableRead',
                            min: '1',
                            max: '10',
                            target: '70',
                            dimension: 'table:ReadCapacityUnits',
                            metric: 'DynamoDBReadCapacityUtilization',
                            resourceId: 'table/' + fullTableName,
                            dependsOn: null
                        });

                        expect(targets[1], 'table write target').to.include({
                            logicalIdPrefix: 'TableWrite',
                            min: '2',
                            max: '5',
                            target: '99',
                            dimension: 'table:WriteCapacityUnits',
                            metric: 'DynamoDBWriteCapacityUtilization',
                            resourceId: 'table/' + fullTableName,
                            dependsOn: 'TableRead'
                        });
                    });
            });

            it("global secondary indexes should default to match table autoscaling", function () {
                let config = serviceContext.params = clone(VALID_DYNAMODB_CONFIG);
                config.provisioned_throughput.read_capacity_units = '1-10';
                config.provisioned_throughput.write_capacity_units = '2-5';
                config.provisioned_throughput.write_target_utilization = 99;
                delete config.global_indexes[0].provisioned_throughput;

                return dynamodb.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts)
                    .then(deployContext => {
                        //If it was only called once, we didn't deploy the autoscaling stack
                        expect(deployStackStub.calledTwice).to.be.true;
                        expect(templateSpy.calledTwice).to.be.true;
                        let tableParams = templateSpy.firstCall.args[1];
                        let autoscaleParams = templateSpy.lastCall.args[1];

                        expect(tableParams).to.have.property('globalIndexes').which.has.lengthOf(1);
                        expect(tableParams.globalIndexes[0]).to.have.property('indexReadCapacityUnits', '1');
                        expect(tableParams.globalIndexes[0]).to.have.property('indexWriteCapacityUnits', '2');
                        expect(tableParams).to.have.property('tableWriteCapacityUnits', '2');

                        expect(autoscaleParams).to.have.property('targets')
                            .with.lengthOf(4);

                        let targets = autoscaleParams.targets;

                        expect(targets[2], 'index read target').to.deep.include({
                            logicalIdPrefix: 'IndexMyglobalRead',
                            min: '1',
                            max: '10',
                            target: '70',
                            dimension: 'index:ReadCapacityUnits',
                            metric: 'DynamoDBReadCapacityUtilization',
                            resourceId: 'table/' + fullTableName + '/index/myglobal',
                            dependsOn: 'TableWrite'
                        });

                        expect(targets[3], 'index write target').to.deep.include({
                            logicalIdPrefix: 'IndexMyglobalWrite',
                            min: '2',
                            max: '5',
                            target: '99',
                            dimension: 'index:WriteCapacityUnits',
                            metric: 'DynamoDBWriteCapacityUtilization',
                            resourceId: 'table/' + fullTableName + '/index/myglobal',
                            dependsOn: 'IndexMyglobalRead'
                        });
                    });
            });

            it("global secondary indexes should be independently configurable", function () {
                let config = serviceContext.params = clone(VALID_DYNAMODB_CONFIG);
                let globalConfig = config.global_indexes[0];
                globalConfig.provisioned_throughput.read_capacity_units = '1-10';
                globalConfig.provisioned_throughput.write_capacity_units = '2-5';
                globalConfig.provisioned_throughput.write_target_utilization = 99;

                return dynamodb.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts)
                    .then(deployContext => {
                        //If it was only called once, we didn't deploy the autoscaling stack
                        expect(deployStackStub.calledTwice).to.be.true;
                        expect(templateSpy.calledTwice).to.be.true;
                        let tableParams = templateSpy.firstCall.args[1];
                        let autoscaleParams = templateSpy.lastCall.args[1];

                        expect(tableParams).to.have.property('tableReadCapacityUnits', '3');
                        expect(tableParams).to.have.property('tableWriteCapacityUnits', '3');

                        expect(tableParams).to.have.property('globalIndexes').which.has.lengthOf(1);
                        expect(tableParams.globalIndexes[0]).to.have.property('indexReadCapacityUnits', '1');
                        expect(tableParams.globalIndexes[0]).to.have.property('indexWriteCapacityUnits', '2');
                        expect(tableParams).to.have.property('tableWriteCapacityUnits', '3');

                        expect(autoscaleParams).to.have.property('targets').which.has.lengthOf(2);

                        let targets = autoscaleParams.targets;

                        expect(targets[0], 'index read target').to.deep.include({
                            logicalIdPrefix: 'IndexMyglobalRead',
                            min: '1',
                            max: '10',
                            target: '70',
                            dimension: 'index:ReadCapacityUnits',
                            metric: 'DynamoDBReadCapacityUtilization',
                            resourceId: 'table/' + fullTableName + '/index/myglobal',
                            dependsOn: null
                        });

                        expect(targets[1], 'index write target').to.deep.include({
                            logicalIdPrefix: 'IndexMyglobalWrite',
                            min: '2',
                            max: '5',
                            target: '99',
                            dimension: 'index:WriteCapacityUnits',
                            metric: 'DynamoDBWriteCapacityUtilization',
                            resourceId: 'table/' + fullTableName + '/index/myglobal',
                            dependsOn: 'IndexMyglobalRead'
                        });
                    });
            });


        });
    });

    describe('produceEvents', function () {
        it('should return an empty ProduceEventsContext', function () {
            return dynamodb.produceEvents(null, null, null, null)
                .then(produceEventsContext => {
                    console.log(produceEventsContext, '?=', new ProduceEventsContext(null, null));
                    expect(produceEventsContext).to.deep.equal(new ProduceEventsContext(null, null));
                })
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return dynamodb.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});
