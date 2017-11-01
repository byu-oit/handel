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
const mysql = require('../../../dist/services/mysql');
const ssmCalls = require('../../../dist/aws/ssm-calls');
const cloudFormationCalls = require('../../../dist/aws/cloudformation-calls');
const ServiceContext = require('../../../dist/datatypes/service-context');
const DeployContext = require('../../../dist/datatypes/deploy-context');
const PreDeployContext = require('../../../dist/datatypes/pre-deploy-context');
const BindContext = require('../../../dist/datatypes/bind-context');
const preDeployPhaseCommon = require('../../../dist/common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../../dist/common/bind-phase-common');
const deletePhasesCommon = require('../../../dist/common/delete-phases-common');
const UnPreDeployContext = require('../../../dist/datatypes/un-pre-deploy-context');
const UnBindContext = require('../../../dist/datatypes/un-bind-context');
const UnDeployContext = require('../../../dist/datatypes/un-deploy-context');
const rdsDeployersCommon = require('../../../dist/common/rds-deployers-common');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../../dist/account-config/account-config');

describe('mysql deployer', function () {
    let sandbox;
    let appName = "FakeApp";
    let envName = "FakeEnv";
    let serviceContext;

    beforeEach(function () {
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext(appName, envName, "FakeService", "mysql", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require the database_name parameter', function () {
            serviceContext.params = {
                mysql_version: '5.6.27'
            }
            let errors = mysql.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'database_name' parameter is required`);
        });

        it('should require the mysql_version parameter', function () {
            serviceContext.params = {
                database_name: 'mydb'
            }
            let errors = mysql.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'mysql_version' parameter is required`);
        });

        it('should work when all required parameters are provided properly', function () {
            serviceContext.params = {
                database_name: 'mydb',
                mysql_version: '5.6.27'
            }
            let errors = mysql.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('preDeploy', function () {
        it('should create a security group', function () {
            let groupId = "FakeSgGroupId";
            let preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push({
                GroupId: groupId
            });
            let createSgStub = sandbox.stub(preDeployPhaseCommon, 'preDeployCreateSecurityGroup').returns(Promise.resolve(preDeployContext));

            return mysql.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                    expect(preDeployContext.securityGroups.length).to.equal(1);
                    expect(preDeployContext.securityGroups[0].GroupId).to.equal(groupId);
                    expect(createSgStub.callCount).to.equal(1);
                });
        });
    });

    describe('bind', function () {
        it('should add the source sg to its own sg as an ingress rule', function () {
            let bindSgStub = sandbox.stub(bindPhaseCommon, 'bindDependentSecurityGroupToSelf').returns(Promise.resolve(new BindContext({}, {})));

            return mysql.bind({}, {}, {}, {})
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                    expect(bindSgStub.callCount).to.equal(1);
                });
        });
    });

    describe('deploy', function () {
        let envPrefix = 'FAKESERVICE';
        let databaseAddress = "fakeaddress.amazonaws.com";
        let databasePort = 3306;
        let databaseName = "mydb";
        let ownPreDeployContext;
        let dependenciesDeployContexts;
        let deployedStack = {
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
                    OutputKey: "DatabaseName",
                    OutputValue: databaseName
                }
            ]
        }

        beforeEach(function () {
            serviceContext.params = {
                database_name: 'mydb',
                mysql_version: '5.6.27'
            }

            ownPreDeployContext = new PreDeployContext(serviceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: 'FakeId'
            });

            dependenciesDeployContexts = [];
        })

        it('should create the cluster if it doesnt exist', function () {
            let getStackStub = sandbox.stub(cloudFormationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudFormationCalls, 'createStack').returns(Promise.resolve(deployedStack));
            let addCredentialsStub = sandbox.stub(rdsDeployersCommon, 'addDbCredentialToParameterStore').returns(Promise.resolve(deployedStack));

            return mysql.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(createStackStub.calledOnce).to.be.true;
                    expect(addCredentialsStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.environmentVariables[`${envPrefix}_ADDRESS`]).to.equal(databaseAddress);
                    expect(deployContext.environmentVariables[`${envPrefix}_PORT`]).to.equal(databasePort);
                    expect(deployContext.environmentVariables[`${envPrefix}_DATABASE_NAME`]).to.equal(databaseName);
                });
        });

        it('should not update the database if it already exists', function () {
            let getStackStub = sandbox.stub(cloudFormationCalls, 'getStack').returns(Promise.resolve(deployedStack));
            let updateStackStub = sandbox.stub(cloudFormationCalls, 'updateStack').returns(Promise.resolve(null));

            return mysql.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(updateStackStub.notCalled).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.environmentVariables[`${envPrefix}_ADDRESS`]).to.equal(databaseAddress);
                    expect(deployContext.environmentVariables[`${envPrefix}_PORT`]).to.equal(databasePort);
                    expect(deployContext.environmentVariables[`${envPrefix}_DATABASE_NAME`]).to.equal(databaseName);
                });
        });
    });

    describe('unPreDeploy', function () {
        it('should delete the security group', function () {
            let unPreDeployStub = sandbox.stub(deletePhasesCommon, 'unPreDeploySecurityGroup').returns(Promise.resolve(new UnPreDeployContext({})));

            return mysql.unPreDeploy({})
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeployStub.callCount).to.equal(1);
                });
        });
    });

    describe('unBind', function () {
        it('should unbind the security group', function () {
            let unBindStub = sandbox.stub(deletePhasesCommon, 'unBindSecurityGroups').returns(Promise.resolve(new UnBindContext({})));

            return mysql.unBind({})
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                    expect(unBindStub.callCount).to.equal(1);
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "mysql", {}, {});
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(new UnDeployContext(serviceContext)));
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
