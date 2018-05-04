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
    ServiceContext,
    ServiceType,
    UnDeployContext,
    UnPreDeployContext,
} from 'handel-extension-api';
import { awsCalls, deletePhases, deployPhase, preDeployPhase } from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as ec2Calls from '../../../src/aws/ec2-calls';
import * as route53calls from '../../../src/aws/route53-calls';
import * as ecsContainers from '../../../src/common/ecs-containers';
import * as ecsRouting from '../../../src/common/ecs-routing';
import * as ecsServiceAutoScaling from '../../../src/common/ecs-service-auto-scaling';
import { LoadBalancerConfigType } from '../../../src/common/ecs-shared-config-types';
import * as ecs from '../../../src/services/ecs';
import * as asgCycling from '../../../src/services/ecs/asg-cycling';
import { EcsServiceConfig } from '../../../src/services/ecs/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

const VALID_ECS_CONFIG: EcsServiceConfig = {
    type: 'ecs',
    cluster: {
        key_name: 'fakekey',
        instance_type: 'm3.medium'
    },
    auto_scaling: {
        min_tasks: 2,
        max_tasks: 2
    },
    load_balancer: {
        type: LoadBalancerConfigType.HTTPS,
        https_certificate: 'fakeid',
        dns_names: [
            'myapp.byu.edu',
            'myapp.internal'
        ]
    },
    tags: {
        mytag: 'myvalue'
    },
    containers: [
        {
            name: 'mycontainer',
            port_mappings: [5000],
            max_mb: 256,
            cpu_units: 101,
            environment_variables: {
                MY_VAR: 'myvalue'
            },
            routing: {
                base_path: '/mypath',
                health_check_path: '/healthcheck'
            }
        }
    ]
};

describe('ecs deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<EcsServiceConfig>;
    let serviceParams: EcsServiceConfig;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = clone(VALID_ECS_CONFIG);
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'ecs'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        let checkAutoScalingStub: sinon.SinonStub;
        let checkLoadBalancerStub: sinon.SinonStub;
        let checkContainersStub: sinon.SinonStub;

        beforeEach(() => {
            checkAutoScalingStub = sandbox.stub(ecsServiceAutoScaling, 'checkAutoScalingSection').returns([]);
            checkLoadBalancerStub = sandbox.stub(ecsRouting, 'checkLoadBalancerSection').returns([]);
            checkContainersStub = sandbox.stub(ecsContainers, 'checkContainers').returns([]);
        });

        it('should return no errors on a successful configuration', () => {
            const errors = ecs.check(serviceContext, []);

            expect(errors.length).to.equal(0);
            expect(checkAutoScalingStub.callCount).to.equal(1);
            expect(checkLoadBalancerStub.callCount).to.equal(1);
            expect(checkContainersStub.callCount).to.equal(1);
        });

        describe('\'logging\' validation', () => {
            it('should allow \'enabled\'', () => {
                serviceContext.params.logging = 'enabled';
                const errors = ecs.check(serviceContext, []);
                expect(errors.length).to.equal(0);
                expect(checkAutoScalingStub.callCount).to.equal(1);
                expect(checkLoadBalancerStub.callCount).to.equal(1);
                expect(checkContainersStub.callCount).to.equal(1);
            });

            it('should allow \'disabled\'', () => {
                serviceContext.params.logging = 'disabled';
                const errors = ecs.check(serviceContext, []);
                expect(errors.length).to.equal(0);
                expect(checkAutoScalingStub.callCount).to.equal(1);
                expect(checkLoadBalancerStub.callCount).to.equal(1);
                expect(checkContainersStub.callCount).to.equal(1);
            });

            it('should reject anything else', () => {
                serviceContext.params.logging = 'something else';
                const errors = ecs.check(serviceContext, []);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.contain('\'logging\' parameter must be either \'enabled\' or \'disabled\'');
                expect(checkAutoScalingStub.callCount).to.equal(1);
                expect(checkLoadBalancerStub.callCount).to.equal(1);
                expect(checkContainersStub.callCount).to.equal(1);
            });
        });
    });

    describe('preDeploy', () => {
        it('should create a security group and add ingress to self and SSH bastion', async () => {
            const preDeployContext = new PreDeployContext(serviceContext);
            const groupId = 'FakeSgGroupId';
            preDeployContext.securityGroups.push({
                GroupId: groupId
            });
            const createSgStub = sandbox.stub(preDeployPhase, 'preDeployCreateSecurityGroup').resolves(preDeployContext);

            const retContext = await ecs.preDeploy(serviceContext);
            expect(retContext).to.be.instanceof(PreDeployContext);
            expect(retContext.securityGroups.length).to.equal(1);
            expect(retContext.securityGroups[0].GroupId).to.equal(groupId);
            expect(createSgStub.callCount).to.equal(1);
        });
    });

    describe('deploy', () => {
        function getOwnPreDeployContextForDeploy(ownServiceContext: ServiceContext<EcsServiceConfig>): PreDeployContext {
            const ownPreDeployContext = new PreDeployContext(ownServiceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: 'FakeSgId'
            });
            return ownPreDeployContext;
        }

        function getDependenciesDeployContextsForDeploy(app: string, env: string): DeployContext[] {
            const dependenciesDeployContexts = [];
            const dependency1ServiceName = 'Dependency1Service';
            const dependency1ServiceType = 'dynamodb';
            const dependency1Params = { type: 'dynamodb' };
            const dependency1DeployContext = new DeployContext(new ServiceContext(app, env, dependency1ServiceName, new ServiceType(STDLIB_PREFIX, dependency1ServiceType), dependency1Params, accountConfig));
            dependenciesDeployContexts.push(dependency1DeployContext);
            const envVarName = 'DYNAMODB_SOME_VAR';
            const envVarValue = 'SomeValue';
            dependency1DeployContext.environmentVariables[envVarName] = envVarValue;
            dependency1DeployContext.policies.push({
                'Sid': `DynamoAccess`,
                'Effect': 'Allow',
                'Action': [
                    'dynamodb:SomeAction',
                ],
                'Resource': [
                    'someArn'
                ]
            });

            const dependency2ServiceName = 'Dependency2Service';
            const dependency2ServiceType = 'efs';
            const dependency2Params = { type: 'efs' };
            const dependency2DeployContext = new DeployContext(new ServiceContext(app, env, dependency2ServiceName, new ServiceType(STDLIB_PREFIX, dependency2ServiceType), dependency2Params, accountConfig));
            dependenciesDeployContexts.push(dependency2DeployContext);
            const scriptContents = 'SOME SCRIPT';
            dependency2DeployContext.scripts.push(scriptContents);
            return dependenciesDeployContexts;
        }

        it('should deploy the ECS service stack', async () => {
            const ownPreDeployContext = getOwnPreDeployContextForDeploy(serviceContext);
            const dependenciesDeployContexts = getDependenciesDeployContextsForDeploy(appName, envName);

            // Stub out AWS calls
            const getLatestAmiByNameStub = sandbox.stub(ec2Calls, 'getLatestAmiByName').resolves({
                ImageId: 'FakeAmiId'
            });
            const getHostedZonesStub = sandbox.stub(route53calls, 'listHostedZones').resolves([{
                Id: '1',
                Name: 'myapp.byu.edu.'
            }, {
                Id: '2',
                Name: 'myapp.internal.'
            }]);
            const getStackStub = sandbox.stub(awsCalls.cloudFormation, 'getStack').resolves(null);
            const uploadDirStub = sandbox.stub(deployPhase, 'uploadDirectoryToHandelBucket').resolves({});
            const createStackStub = sandbox.stub(awsCalls.cloudFormation, 'createStack').resolves({});
            const deployStackStub = sandbox.stub(deployPhase, 'deployCloudFormationStack').resolves({});

            const getInstancesToCycleStub = sandbox.stub(asgCycling, 'getInstancesToCycle').resolves([]);
            const cycleInstancesStub = sandbox.stub(asgCycling, 'cycleInstances').resolves({});

            // Run the test
            const deployContext = await ecs.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(getStackStub.callCount).to.equal(2);
            expect(uploadDirStub.callCount).to.equal(2);
            expect(getLatestAmiByNameStub.callCount).to.equal(1);
            expect(createStackStub.callCount).to.equal(2);
            expect(deployStackStub.callCount).to.equal(1);
            expect(getInstancesToCycleStub.callCount).to.equal(1);
            expect(cycleInstancesStub.callCount).to.equal(1);

            // DNS name setup
            expect(deployStackStub.firstCall.args[1]).to.include('myapp.byu.edu');
            expect(deployStackStub.firstCall.args[1]).to.include('HostedZoneId: 1');
            expect(deployStackStub.firstCall.args[1]).to.include('myapp.internal');

            // Container Logging Setup
            expect(deployStackStub.firstCall.args[1]).to.include('awslogs');
            expect(deployStackStub.firstCall.args[1]).to.include('LogConfiguration');
            expect(deployStackStub.firstCall.args[1]).to.include(`LogGroupName: ecs/${appName}-${envName}-FakeService`);
        });

        it('should deploy a new ECS service stack', async () => {
            const ownPreDeployContext = getOwnPreDeployContextForDeploy(serviceContext);
            const dependenciesDeployContexts = getDependenciesDeployContextsForDeploy(appName, envName);

            // Stub out AWS calls
            const getLatestAmiByNameStub = sandbox.stub(ec2Calls, 'getLatestAmiByName').resolves({
                ImageId: 'FakeAmiId'
            });
            const getHostedZonesStub = sandbox.stub(route53calls, 'listHostedZones').resolves([{
                Id: '1',
                Name: 'myapp.byu.edu.'
            }, {
                Id: '2',
                Name: 'myapp.internal.'
            }]);
            const getStackStub = sandbox.stub(awsCalls.cloudFormation, 'getStack').resolves(null);
            const uploadDirStub = sandbox.stub(deployPhase, 'uploadDirectoryToHandelBucket').resolves({});
            const createStackStub = sandbox.stub(awsCalls.cloudFormation, 'createStack').resolves({});
            const deployStackStub = sandbox.stub(deployPhase, 'deployCloudFormationStack').resolves({});

            const getInstancesToCycleStub = sandbox.stub(asgCycling, 'getInstancesToCycle').resolves([]);
            const cycleInstancesStub = sandbox.stub(asgCycling, 'cycleInstances').resolves({});

            // Run the test
            const deployContext = await ecs.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(getStackStub.callCount).to.equal(2);
            expect(uploadDirStub.callCount).to.equal(2);
            expect(getLatestAmiByNameStub.callCount).to.equal(1);
            expect(createStackStub.callCount).to.equal(2);
            expect(deployStackStub.callCount).to.equal(1);
            expect(getInstancesToCycleStub.callCount).to.equal(1);
            expect(cycleInstancesStub.callCount).to.equal(1);

            // DNS name setup
            expect(deployStackStub.firstCall.args[1]).to.include('myapp.byu.edu');
            expect(deployStackStub.firstCall.args[1]).to.include('HostedZoneId: 1');
            expect(deployStackStub.firstCall.args[1]).to.include('myapp.internal');

            // Container Logging Setup
            expect(deployStackStub.firstCall.args[1]).to.include('awslogs');
            expect(deployStackStub.firstCall.args[1]).to.include('LogConfiguration');
            expect(deployStackStub.firstCall.args[1]).to.include(`LogGroupName: ecs/${appName}-${envName}-FakeService`);
        });
    });

    describe('unPreDeploy', () => {
        it('should delete the security group', async () => {
            const unPreDeployStub = sandbox.stub(deletePhases, 'unPreDeploySecurityGroup').resolves(new UnPreDeployContext(serviceContext));

            const unPreDeployContext = await ecs.unPreDeploy(serviceContext);
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployStub.callCount).to.equal(1);
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(deletePhases, 'unDeployService').resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await ecs.unDeploy(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
