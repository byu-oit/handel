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
const efs = require('../../../lib/services/efs');
const ec2Calls = require('../../../lib/aws/ec2-calls');
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

describe('efs deployer', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require either max_io or general_purpose for the performance_mode parameter', function () {
            //Errors expected
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "efs", "1", {
                performance_mode: 'other_param'
            });
            let errors = efs.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("'performance_mode' parameter must be either");

            //No errors expected
            serviceContext.params.performance_mode = 'general_purpose';
            errors = efs.check(serviceContext);
            expect(errors.length).to.equal(0);

            //No errors expected            
            serviceContext.params.performance_mode = 'max_io';
            errors = efs.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('preDeploy', function () {
        it('should create a security group', function () {
            let groupId = "FakeSgGroupId";
            let createSecurityGroupStub = sandbox.stub(preDeployPhaseCommon, 'createSecurityGroupForService').returns(Promise.resolve({
                GroupId: groupId
            }));

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return efs.preDeploy(serviceContext)
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
            let ownServiceContext = new ServiceContext(appName, envName, "FakeService", "efs", deployVersion, {});
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

            return efs.bind(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext)
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
        let ownServiceContext = new ServiceContext(appName, envName, "FakeService", "efs", deployVersion, {});
        let ownPreDeployContext = new PreDeployContext(ownServiceContext);
        ownPreDeployContext.securityGroups.push({
            GroupId: 'FakeId'
        });
        let dependenciesDeployContexts = [];
        let fileSystemId = "FakeFileSystemId";

        it('should deploy the file system', function () {
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: "EFSFileSystemId",
                    OutputValue: fileSystemId
                }]
            }));

            return efs.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployStackStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.scripts.length).to.equal(1);
                });
        });
    });

    describe('consumerEvents', function () {
        it('should throw an error because EFS cant consume event services', function () {
            return efs.consumeEvents(null, null, null, null)
                .then(consumeEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("EFS service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function () {
        it('should throw an error because EFS cant produce events for other services', function () {
            return efs.produceEvents(null, null, null, null)
                .then(produceEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("EFS service doesn't produce events");
                });
        });
    });

    describe('unPreDeploy', function () {
        it('should delete the security group', function () {
            let deleteSecurityGroupStub = sandbox.stub(deletePhasesCommon, 'deleteSecurityGroupForService').returns(Promise.resolve(true));

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "efs", "1", {});
            return efs.unPreDeploy(serviceContext)
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(deleteSecurityGroupStub.calledOnce).to.be.true;
                });
        });
    });

    describe('unBind', function () {
        it('should unbind the security group', function () {
            let unBindAllStub = sandbox.stub(deletePhasesCommon, 'unBindAllOnSg').returns(Promise.resolve(true));

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "efs", "1", {});
            return efs.unBind(serviceContext)
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                    expect(unBindAllStub.calledOnce).to.be.true;
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "efs", "1", {});
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployCloudFormationStack').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return efs.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});