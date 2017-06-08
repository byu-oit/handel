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
const mysql = require('../../../lib/services/mysql');
const ec2Calls = require('../../../lib/aws/ec2-calls');
const ssmCalls = require('../../../lib/aws/ssm-calls');
const cloudFormationCalls = require('../../../lib/aws/cloudformation-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const preDeployPhaseCommon = require('../../../lib/common/pre-deploy-phase-common');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const UnBindContext = require('../../../lib/datatypes/un-bind-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('mysql deployer', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should do require the database_name parameter', function () {
            let serviceContext = {
                params: {}
            }
            let errors = mysql.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'database_name' parameter is required`);
        });

        it('should work when all required parameters are provided properly', function () {
            let serviceContext = {
                params: {
                    database_name: 'mydb',
                }
            }
            let errors = mysql.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('preDeploy', function () {
        it('should create a security group', function () {
            let groupId = "FakeSgGroupId";
            let createSecurityGroupStub = sandbox.stub(preDeployPhaseCommon, 'createSecurityGroupForService').returns(Promise.resolve({
                GroupId: groupId
            }));

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "mysql", "1", {});
            return mysql.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                    expect(preDeployContext.securityGroups.length).to.equal(1);
                    expect(preDeployContext.securityGroups[0].GroupId).to.equal(groupId);
                    expect(createSecurityGroupStub.calledOnce).to.be.true;
                });
        });
    });

    describe('bind', function () {
        it('should add the source sg to its own sg as an ingress rule', function () {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let ownServiceContext = new ServiceContext(appName, envName, "FakeService", "mysql", deployVersion, {});
            let ownPreDeployContext = new PreDeployContext(ownServiceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: 'FakeId'
            });

            let dependentOfServiceContext = new ServiceContext(appName, envName, "FakeDependentOfService", "ecs", deployVersion, {});
            let dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);
            dependentOfPreDeployContext.securityGroups.push({
                GroupId: 'OtherId'
            });

            let addIngressRuleToSgIfNotExistsStub = sandbox.stub(ec2Calls, 'addIngressRuleToSgIfNotExists').returns(Promise.resolve({}));

            return mysql.bind(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                    expect(addIngressRuleToSgIfNotExistsStub.calledOnce).to.be.true;
                });
        });
    });

    describe('deploy', function () {
        let appName = "FakeApp";
        let envName = "FakeEnv";
        let deployVersion = "1";
        let ownServiceContext = new ServiceContext(appName, envName, "FakeService", "mysql", deployVersion, {
            database_name: 'mydb'
        });
        let ownPreDeployContext = new PreDeployContext(ownServiceContext);
        ownPreDeployContext.securityGroups.push({
            GroupId: 'FakeId'
        });
        let dependenciesDeployContexts = [];

        let envPrefix = `MYSQL_${appName}_${envName}_FAKESERVICE`.toUpperCase();
        let databaseAddress = "fakeaddress.amazonaws.com";
        let databasePort = 3306;
        let databaseUsername = "handel";
        let databaseName = "mydb";

        it('should create the cluster if it doesnt exist', function () {
            let getStackStub = sandbox.stub(cloudFormationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudFormationCalls, 'createStack').returns(Promise.resolve({
                Outputs: [
                    {
                        OutputKey: "DatabaseAddress",
                        OutputValue: databaseAddress
                    },
                    {
                        OutputKey: "DatabasePort",
                        OutputValue: databasePort
                    },
                    {
                        OutputKey: "DatabaseUsername",
                        OutputValue: databaseUsername
                    },
                    {
                        OutputKey: "DatabaseName",
                        OutputValue: databaseName
                    }
                ]
            }));
            let putParameterStub = sandbox.stub(ssmCalls, 'storeParameter').returns(Promise.resolve({}));

            return mysql.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(createStackStub.calledOnce).to.be.true;
                    expect(putParameterStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.environmentVariables[`${envPrefix}_ADDRESS`]).to.equal(databaseAddress);
                    expect(deployContext.environmentVariables[`${envPrefix}_PORT`]).to.equal(databasePort);
                    expect(deployContext.environmentVariables[`${envPrefix}_USERNAME`]).to.equal(databaseUsername);
                    expect(deployContext.environmentVariables[`${envPrefix}_DATABASE_NAME`]).to.equal(databaseName);
                });
        });

        it('should not update the database if it already exists', function () {
            let getStackStub = sandbox.stub(cloudFormationCalls, 'getStack').returns(Promise.resolve({
                Outputs: [
                    {
                        OutputKey: "DatabaseAddress",
                        OutputValue: databaseAddress
                    },
                    {
                        OutputKey: "DatabasePort",
                        OutputValue: databasePort
                    },
                    {
                        OutputKey: "DatabaseUsername",
                        OutputValue: databaseUsername
                    },
                    {
                        OutputKey: "DatabaseName",
                        OutputValue: databaseName
                    }
                ]
            }));
            let updateStackStub = sandbox.stub(cloudFormationCalls, 'updateStack').returns(Promise.resolve(null));

            return mysql.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(updateStackStub.notCalled).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.environmentVariables[`${envPrefix}_ADDRESS`]).to.equal(databaseAddress);
                    expect(deployContext.environmentVariables[`${envPrefix}_PORT`]).to.equal(databasePort);
                    expect(deployContext.environmentVariables[`${envPrefix}_USERNAME`]).to.equal(databaseUsername);
                    expect(deployContext.environmentVariables[`${envPrefix}_DATABASE_NAME`]).to.equal(databaseName);
                });
        });
    });

    describe('consumeEvents', function () {
        it('should throw an error because MySQL cant consume event services', function () {
            return mysql.consumeEvents(null, null, null, null)
                .then(consumeEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("MySQL service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function () {
        it('should throw an error because MySQL cant produce events for other services', function () {
            return mysql.produceEvents(null, null, null, null)
                .then(produceEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("MySQL service doesn't produce events");
                });
        });
    });

    describe('unPreDeploy', function () {
        it('should delete the security group', function () {
            let deleteSecurityGroupStub = sandbox.stub(deletePhasesCommon, 'deleteSecurityGroupForService').returns(Promise.resolve(true));

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "mysql", "1", {});
            return mysql.unPreDeploy(serviceContext)
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(deleteSecurityGroupStub.calledOnce).to.be.true;
                });
        });
    });

    describe('unBind', function () {
        it('should unbind the security group', function () {
            let unBindAllStub = sandbox.stub(deletePhasesCommon, 'unBindAllOnSg').returns(Promise.resolve(true));

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "mysql", "1", {});
            return mysql.unBind(serviceContext)
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                    expect(unBindAllStub.calledOnce).to.be.true;
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "mysql", "1", {});
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployCloudFormationStack').returns(Promise.resolve(new UnDeployContext(serviceContext)));
            let deleteParametersStub = sandbox.stub(ssmCalls, 'deleteParameters').returns(Promise.resolve({}));

            return mysql.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.true;
                    expect(deleteParametersStub.calledOnce).to.be.true;
                });
        });
    });
});