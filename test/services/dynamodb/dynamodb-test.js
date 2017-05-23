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
const accountConfig = require('../../../lib/common/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const dynamodb = require('../../../lib/services/dynamodb');
const cloudFormationCalls = require('../../../lib/aws/cloudformation-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const deployersCommon = require('../../../lib/common/deployers-common');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const UnBindContext = require('../../../lib/datatypes/un-bind-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const sinon = require('sinon');
const expect = require('chai').expect;


describe('dynamodb deployer', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require a partition key section', function () {
            let params = {};
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "dynamodb", "1", params);
            let errors = dynamodb.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("partition_key section is required");
        });

        it('should require a name field in the partition_key', function () {
            let params = {
                partition_key: {
                    type: 'sometype'
                }
            };
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "dynamodb", "1", params);
            let errors = dynamodb.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("name field in partition_key is required");
        });

        it('should require a type field in the partition_key', function () {
            let params = {
                partition_key: {
                    name: 'somename'
                }
            };
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "dynamodb", "1", params);
            let errors = dynamodb.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("type field in partition_key is required");
        });
    });

    describe('preDeploy', function () {
        it('should do nothing and just return an empty PreDeployContext', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return dynamodb.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                });
        });
    });

    describe('bind', function () {
        it('should do nothing and just return an empty BindContext', function () {
            let ownServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let ownPreDeployContext = new PreDeployContext(ownServiceContext);
            let dependentOfServiceContext = new ServiceContext("FakeApp", "FakeEnv", "OtherService", "OtherType", "1", {});
            let dependentOfPreDeployContext = new PreDeployContext(ownServiceContext);
            return dynamodb.bind(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('deploy', function () {
        let appName = "FakeApp";
        let envName = "FakeEnv";
        let serviceName = "FakeService";
        let serviceType = "dynamodb";
        let deployVersion = "1";
        let params = {
            partition_key: {
                name: "MyPartitionKey",
                type: "String"
            }
        }
        let ownServiceContext = new ServiceContext(appName, envName, serviceName, serviceType, deployVersion, params);
        let ownPreDeployContext = new PreDeployContext(ownServiceContext);
        let dependenciesDeployContexts = [];

        let tableName = "FakeTable";
        let tableArn = `arn:aws:dynamodb:us-west-2:123456789012:table/${tableName}`

        it('should create a new table when one doesnt exist', function () {
            let getStackStub = sandbox.stub(cloudFormationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudFormationCalls, 'createStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'TableName',
                    OutputValue: tableName
                }]
            }));

            return dynamodb.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(createStackStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.policies.length).to.equal(1);
                    expect(deployContext.policies[0].Resource[0]).to.equal(tableArn);
                    let tableNameVar = `${serviceType}_${appName}_${envName}_${serviceName}_TABLE_NAME`.toUpperCase();
                    expect(deployContext.environmentVariables[tableNameVar]).to.equal(tableName);
                });
        });

        it('should not update anything on a table when one already exists', function () {
            let getStackStub = sandbox.stub(cloudFormationCalls, 'getStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'TableName',
                    OutputValue: tableName
                }]
            }));
            let createStackStub = sandbox.stub(cloudFormationCalls, 'createStack').returns(Promise.resolve({}));

            return dynamodb.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(createStackStub.notCalled).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.policies.length).to.equal(1);
                    expect(deployContext.policies[0].Resource[0]).to.equal(tableArn);
                    let tableNameVar = `${serviceType}_${appName}_${envName}_${serviceName}_TABLE_NAME`.toUpperCase();
                    expect(deployContext.environmentVariables[tableNameVar]).to.equal(tableName);
                });
        });
    });

    describe('consumeEvents', function () {
        it('should throw an error because DynamoDB cant consume event services', function () {
            return dynamodb.consumeEvents(null, null, null, null)
                .then(consumeEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("DynamoDB service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function () {
        it('should throw an error because DynamoDB doesnt yet produce events for other services', function () {
            return dynamodb.produceEvents(null, null, null, null)
                .then(produceEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("DynamoDB service doesn't produce events");
                });
        });
    });

    describe('unPreDeploy', function () {
        it('should return an empty UnPreDeploy context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "dynamodb", "1", {});
            return dynamodb.unPreDeploy(serviceContext)
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                });
        });
    });

    describe('unBind', function () {
        it('should return an empty UnBind context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "dynamodb", "1", {});
            return dynamodb.unBind(serviceContext)
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "dynamodb", "1", {});
            let unDeployStackStub = sandbox.stub(deployersCommon, 'unDeployCloudFormationStack').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return dynamodb.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});