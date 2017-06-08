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
const beanstalk = require('../../../lib/services/beanstalk');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const deployersCommon = require('../../../lib/common/deployers-common');
const deployableArtifact = require('../../../lib/services/beanstalk/deployable-artifact');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const UnBindContext = require('../../../lib/datatypes/un-bind-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const sinon = require('sinon');
const expect = require('chai').expect;


describe('beanstalk deployer', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should check parameters for correctness', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let errors = beanstalk.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('preDeploy', function () {
        it('should create a security group and add self and SSH bastion ingress', function () {
            let groupId = "FakeSgGroupId";
            let createSecurityGroupStub = sandbox.stub(deployersCommon, 'createSecurityGroupForService').returns(Promise.resolve({
                GroupId: groupId
            }));

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return beanstalk.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                    expect(preDeployContext.securityGroups.length).to.equal(1);
                    expect(preDeployContext.securityGroups[0].GroupId).to.equal(groupId);
                    expect(createSecurityGroupStub.calledOnce).to.be.true;
                });
        });
    });

    describe('bind', function () {
        it('should do nothing and just return an empty BindContext', function () {
            let ownServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let ownPreDeployContext = new PreDeployContext(ownServiceContext);
            let dependentOfServiceContext = new ServiceContext("FakeApp", "FakeEnv", "OtherService", "OtherType", "1", {});
            let dependentOfPreDeployContext = new PreDeployContext(ownServiceContext);
            return beanstalk.bind(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('deploy', function () {
        function getServiceContext() {
            return new ServiceContext("FakeApp", "FakeEnv", "FakeService", "beanstalk", "1", {
                type: 'beanstalk',
                solution_stack: '64bit Amazon Linux 2016.09 v4.0.1 running Node.js',
                min_instances: 2,
                max_instances: 4,
                key_name: 'MyKey',
                instance_type: 't2.small'
            });
        }

        function getPreDeployContext(serviceContext, sgGroupId) {
            let ownPreDeployContext = new PreDeployContext(serviceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: sgGroupId
            });
            return ownPreDeployContext;
        }

        it('should deploy the service', function () {
            let createCustomRoleStub = sandbox.stub(deployersCommon, 'createCustomRole').returns(Promise.resolve({
                RoleName: "FakeServiceRole"
            }));
            let prepareAndUploadDeployableArtifactStub = sandbox.stub(deployableArtifact, 'prepareAndUploadDeployableArtifact').returns(Promise.resolve({
                Bucket: "FakeBucket",
                Key: "FakeKey"
            }));
            let deployStackStub = sandbox.stub(deployersCommon, 'deployCloudFormationStack').returns(Promise.resolve({}));

            let ownServiceContext = getServiceContext();
            let sgGroupId = "FakeSgId";
            let ownPreDeployContext = getPreDeployContext(ownServiceContext, sgGroupId);

            return beanstalk.deploy(ownServiceContext, ownPreDeployContext, [])
                .then(deployContext => {
                    expect(createCustomRoleStub.calledOnce).to.be.true;
                    expect(prepareAndUploadDeployableArtifactStub.calledOnce).to.be.true;
                    expect(deployStackStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                });
        });
    });

    describe('consumeEvents', function () {
        it('should throw an error because Beanstalk cant consume event services', function () {
            return beanstalk.consumeEvents(null, null, null, null)
                .then(consumeEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Beanstalk service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function () {
        it('should throw an error because Beanstalk doesnt yet produce events for other services', function () {
            return beanstalk.produceEvents(null, null, null, null)
                .then(produceEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Beanstalk service doesn't produce events");
                });
        });
    });

    describe('unPreDeploy', function () {
        it('should delete the security group', function () {
            let deleteSecurityGroupStub = sandbox.stub(deployersCommon, 'deleteSecurityGroupForService').returns(Promise.resolve(true));

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "beanstalk", "1", {});
            return beanstalk.unPreDeploy(serviceContext)
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(deleteSecurityGroupStub.calledOnce).to.be.true;
                });
        });
    });

    describe('unBind', function () {
        it('should return an empty UnBind context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "beanstalk", "1", {});
            return beanstalk.unBind(serviceContext)
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "beanstalk", "1", {});
            let unDeployStackStub = sandbox.stub(deployersCommon, 'unDeployCloudFormationStack').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return beanstalk.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});