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
const dynamodb = require('../../../lib/services/dynamodb');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const ProduceEventsContext = require('../../../lib/datatypes/produce-events-context');
const sinon = require('sinon');
const expect = require('chai').expect;

const accountConfig = require('../../../lib/common/account-config')(`${__dirname}/../../test-account-config.yml`);

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
    let deployVersion = "1";

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
        serviceContext = new ServiceContext(appName, envName, serviceName, serviceType, deployVersion, {}, accountConfig);
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        let configToCheck;

        beforeEach(function () {
            configToCheck = JSON.parse(JSON.stringify(VALID_DYNAMODB_CONFIG))
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
                    let tableNameVar = `${serviceType}_${appName}_${envName}_${serviceName}_TABLE_NAME`.toUpperCase();
                    expect(deployContext.environmentVariables[tableNameVar]).to.equal(tableName);
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
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return dynamodb.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});
