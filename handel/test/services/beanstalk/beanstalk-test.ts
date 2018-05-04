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
import {
    AccountConfig,
    DeployContext,
    PreDeployContext,
    ServiceContext,
    ServiceType,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import { deletePhases, deployPhase, preDeployPhase } from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as route53 from '../../../src/aws/route53-calls';
import * as instanceAutoScaling from '../../../src/common/instance-auto-scaling';
import { InstanceScalingPolicyType } from '../../../src/datatypes';
import * as  beanstalk from '../../../src/services/beanstalk';
import { BeanstalkRoutingType, BeanstalkServiceConfig } from '../../../src/services/beanstalk/config-types';
import * as deployableArtifact from '../../../src/services/beanstalk/deployable-artifact';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('beanstalk deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<BeanstalkServiceConfig>;
    let serviceParams: BeanstalkServiceConfig;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'beanstalk',
            path_to_code: '.',
            solution_stack: '64bit Amazon Linux 2016.09 v4.0.1 running Node.js',
            auto_scaling: {
                min_instances: 2,
                max_instances: 4,
                scaling_policies: [
                    {
                        type: InstanceScalingPolicyType.UP,
                        adjustment: {
                            value: 1,
                            cooldown: 60
                        },
                        alarm: {
                            statistic: 'Average',
                            metric_name: 'CPUUtilization',
                            comparison_operator: 'GreaterThanThreshold',
                            threshold: 70,
                            period: 60
                        }
                    },
                    {
                        type: InstanceScalingPolicyType.DOWN,
                        adjustment: {
                            value: 1,
                            cooldown: 60
                        },
                        alarm: {
                            metric_name: 'CPUUtilization',
                            comparison_operator: 'LessThanThreshold',
                            threshold: 30,
                            period: 60
                        }
                    }
                ]
            },
            key_name: 'MyKey',
            instance_type: 't2.small'
        };
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 'FakeType'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should check parameters for correctness', () => {
            const errors = beanstalk.check(serviceContext, []);
            expect(errors.length).to.equal(0);
        });

        it('should check for valid dns_names', () => {
            serviceContext.params.routing = {
                type: BeanstalkRoutingType.HTTP,
                dns_names: ['invalid hostname']
            };
            const errors = beanstalk.check(serviceContext, []);

            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('\'dns_names\' values must be valid hostnames');
        });
    });

    describe('preDeploy', () => {
        it('should call the predeploy common to create a security group', async () => {
            const groupId = 'FakeSgGroupId';
            const preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push({
                GroupId: groupId
            });
            const preDeployCreateSgStub = sandbox.stub(preDeployPhase, 'preDeployCreateSecurityGroup').resolves(preDeployContext);

            const retContext = await beanstalk.preDeploy(serviceContext);
            expect(retContext).to.be.instanceof(PreDeployContext);
            expect(retContext.securityGroups.length).to.equal(1);
            expect(retContext.securityGroups[0].GroupId).to.equal(groupId);
            expect(preDeployCreateSgStub.callCount).to.equal(1);
        });
    });

    describe('deploy', () => {
        function getPreDeployContext(ownServiceContext: ServiceContext<BeanstalkServiceConfig>, sgGroupId: string) {
            const ownPreDeployContext = new PreDeployContext(ownServiceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: sgGroupId
            });
            return ownPreDeployContext;
        }

        it('should deploy the service', async () => {
            const getScalingPoliciesStub = sandbox.stub(instanceAutoScaling, 'getScalingPoliciesConfig').returns({});
            const prepareAndUploadDeployableArtifactStub = sandbox.stub(deployableArtifact, 'prepareAndUploadDeployableArtifact').resolves({
                Bucket: 'FakeBucket',
                Key: 'FakeKey'
            });
            const deployStackStub = sandbox.stub(deployPhase, 'deployCloudFormationStack').resolves({});

            const sgGroupId = 'FakeSgId';
            const ownPreDeployContext = getPreDeployContext(serviceContext, sgGroupId);

            const deployContext = await beanstalk.deploy(serviceContext, ownPreDeployContext, []);
            expect(getScalingPoliciesStub.callCount).to.equal(1);
            expect(prepareAndUploadDeployableArtifactStub.callCount).to.equal(1);
            expect(deployStackStub.callCount).to.equal(1);
            expect(deployContext).to.be.instanceof(DeployContext);
        });

        it('should set up dns records if requested', async () => {
            const getScalingPoliciesStub = sandbox.stub(instanceAutoScaling, 'getScalingPoliciesConfig').returns({});
            const prepareAndUploadDeployableArtifactStub = sandbox.stub(deployableArtifact, 'prepareAndUploadDeployableArtifact').resolves({
                Bucket: 'FakeBucket',
                Key: 'FakeKey'
            });
            const deployStackStub = sandbox.stub(deployPhase, 'deployCloudFormationStack').resolves({});

            sandbox.stub(route53, 'listHostedZones').resolves([{
                Id: '1',
                Name: 'myapp.byu.edu.'
            }, {
                Id: '2',
                Name: 'myapp.internal.'
            }]);

            const sgGroupId = 'FakeSgId';
            const ownPreDeployContext = getPreDeployContext(serviceContext, sgGroupId);

            serviceContext.params.routing = {
                type: BeanstalkRoutingType.HTTP,
                dns_names: [
                    'myapp.byu.edu',
                    'myapp.internal'
                ]
            };

            const deployContext = await beanstalk.deploy(serviceContext, ownPreDeployContext, []);
            expect(getScalingPoliciesStub.callCount).to.equal(1);
            expect(prepareAndUploadDeployableArtifactStub.callCount).to.equal(1);
            expect(prepareAndUploadDeployableArtifactStub.firstCall.args[1]).to.have.property('02dns-names.config');
            expect(deployStackStub.callCount).to.equal(1);
            expect(deployContext).to.be.instanceof(DeployContext);
        });
    });

    describe('unPreDeploy', () => {
        it('should delete the security group', async () => {
            const unPreDeployStub = sandbox.stub(deletePhases, 'unPreDeploySecurityGroup').resolves(new UnPreDeployContext(serviceContext));

            const unPreDeployContext = await beanstalk.unPreDeploy(serviceContext);
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployStub.callCount).to.equal(1);
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(deletePhases, 'unDeployService').resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await beanstalk.unDeploy(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
