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
const beanstalk = require('../../../dist/services/beanstalk');
const ServiceContext = require('../../../dist/datatypes/service-context').ServiceContext;
const DeployContext = require('../../../dist/datatypes/deploy-context').DeployContext;
const PreDeployContext = require('../../../dist/datatypes/pre-deploy-context').PreDeployContext;
const deployPhaseCommon = require('../../../dist/common/deploy-phase-common');
const preDeployPhaseCommon = require('../../../dist/common/pre-deploy-phase-common');
const deletePhasesCommon = require('../../../dist/common/delete-phases-common');
const deployableArtifact = require('../../../dist/services/beanstalk/deployable-artifact');
const UnPreDeployContext = require('../../../dist/datatypes/un-pre-deploy-context').UnPreDeployContext;
const UnDeployContext = require('../../../dist/datatypes/un-deploy-context').UnDeployContext;
const route53 = require('../../../dist/aws/route53-calls');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../../dist/account-config/account-config');

describe('beanstalk deployer', function () {
    let sandbox;
    let serviceContext;

    beforeEach(function () {
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should check parameters for correctness', function () {
            let errors = beanstalk.check(serviceContext);
            expect(errors.length).to.equal(0);
        });

        it('should check for valid dns_names', function () {
            serviceContext.params = {
                routing: {
                    dns_names: ['invalid hostname']
                }
            }
            let errors = beanstalk.check(serviceContext);

            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("'dns_names' values must be valid hostnames")
        })
    });

    describe('preDeploy', function () {
        it('should call the predeploy common to create a security group', function () {
            let groupId = "FakeSgGroupId";
            let preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push({
                GroupId: groupId
            });
            let preDeployCreateSgStub = sandbox.stub(preDeployPhaseCommon, 'preDeployCreateSecurityGroup').returns(Promise.resolve(preDeployContext));

            return beanstalk.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                    expect(preDeployContext.securityGroups.length).to.equal(1);
                    expect(preDeployContext.securityGroups[0].GroupId).to.equal(groupId);
                    expect(preDeployCreateSgStub.calledOnce).to.be.true;
                });
        });
    });

    describe('deploy', function () {
        beforeEach(function () {
            serviceContext.params = {
                type: 'beanstalk',
                solution_stack: '64bit Amazon Linux 2016.09 v4.0.1 running Node.js',
                auto_scaling: {
                    min_instances: 2,
                    max_instances: 4,
                    scaling_policies: [
                        {
                            type: "up",
                            adjustment: {
                                value: 1,
                                cooldown: 60
                            },
                            alarm: {
                                statistic: "Average",
                                metric_name: "CPUUtilization",
                                comparison_operator: "GreaterThanThreshold",
                                threshold: 70,
                                period: 60
                            }
                        },
                        {
                            type: "down",
                            adjustment: {
                                value: 1,
                                cooldown: 60
                            },
                            alarm: {
                                metric_name: "CPUUtilization",
                                comparison_operator: "LessThanThreshold",
                                threshold: 30,
                                period: 60
                            }
                        }
                    ]
                },
                key_name: 'MyKey',
                instance_type: 't2.small'
            }
        });

        function getPreDeployContext(serviceContext, sgGroupId) {
            let ownPreDeployContext = new PreDeployContext(serviceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: sgGroupId
            });
            return ownPreDeployContext;
        }

        it('should deploy the service', function () {
            let createCustomRoleStub = sandbox.stub(deployPhaseCommon, 'createCustomRole').returns(Promise.resolve({
                RoleName: "FakeServiceRole"
            }));
            let prepareAndUploadDeployableArtifactStub = sandbox.stub(deployableArtifact, 'prepareAndUploadDeployableArtifact').returns(Promise.resolve({
                Bucket: "FakeBucket",
                Key: "FakeKey"
            }));
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({}));

            let sgGroupId = "FakeSgId";
            let ownPreDeployContext = getPreDeployContext(serviceContext, sgGroupId);

            return beanstalk.deploy(serviceContext, ownPreDeployContext, [])
                .then(deployContext => {
                    expect(createCustomRoleStub.calledOnce).to.be.true;
                    expect(prepareAndUploadDeployableArtifactStub.calledOnce).to.be.true;
                    expect(deployStackStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                });
        });

        it('should set up dns records if requested', function () {
            let createCustomRoleStub = sandbox.stub(deployPhaseCommon, 'createCustomRole').returns(Promise.resolve({
                RoleName: "FakeServiceRole"
            }));
            let prepareAndUploadDeployableArtifactStub = sandbox.stub(deployableArtifact, 'prepareAndUploadDeployableArtifact').returns(Promise.resolve({
                Bucket: "FakeBucket",
                Key: "FakeKey"
            }));
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({}));

            sandbox.stub(route53, 'listHostedZones').returns(Promise.resolve([{
                Id: '1',
                Name: 'myapp.byu.edu.'
            }, {
                Id: '2',
                Name: 'myapp.internal.'
            }]));

            let sgGroupId = "FakeSgId";
            let ownPreDeployContext = getPreDeployContext(serviceContext, sgGroupId);

            serviceContext.params.routing = {
                type: 'http',
                dns_names: [
                    'myapp.byu.edu',
                    'myapp.internal'
                ]
            };

            return beanstalk.deploy(serviceContext, ownPreDeployContext, [])
                .then(deployContext => {
                    expect(createCustomRoleStub.calledOnce).to.be.true;
                    expect(prepareAndUploadDeployableArtifactStub.calledOnce).to.be.true;
                    expect(prepareAndUploadDeployableArtifactStub.firstCall.args[1]).to.have.property('02dns-names.config');
                    expect(deployStackStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                });
        });
    });

    describe('unPreDeploy', function () {
        it('should delete the security group', function () {
            let unPreDeployStub = sandbox.stub(deletePhasesCommon, 'unPreDeploySecurityGroup').returns(Promise.resolve(new UnPreDeployContext({})));

            return beanstalk.unPreDeploy({})
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeployStub.callCount).to.equal(1);
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return beanstalk.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});
