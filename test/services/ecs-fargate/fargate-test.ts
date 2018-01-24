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
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as ecsCalls from '../../../src/aws/ecs-calls';
import * as route53calls from '../../../src/aws/route53-calls';
import * as deletePhasesCommon from '../../../src/common/delete-phases-common';
import * as deployPhaseCommon from '../../../src/common/deploy-phase-common';
import * as preDeployPhaseCommon from '../../../src/common/pre-deploy-phase-common';
import { DeployContext, PreDeployContext, ServiceContext, UnDeployContext, UnPreDeployContext, AccountConfig } from '../../../src/datatypes';
import * as ecsFargate from '../../../src/services/ecs-fargate';
import { FargateServiceConfig } from '../../../src/services/ecs-fargate/config-types';
import { LoadBalancerConfigType } from '../../../src/common/ecs-shared-config-types';

const VALID_FARGATE_CONFIG: FargateServiceConfig = {
    type: 'ecs-fargate',
    max_mb: 256,
    cpu_units: 101,
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

describe('fargate deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<FargateServiceConfig>;
    let serviceParams: FargateServiceConfig;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = clone(VALID_FARGATE_CONFIG);
        serviceContext = new ServiceContext(appName, envName, 'FakeService', 'ecs-fargate', serviceParams, accountConfig);

    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should require the auto_scaling section', () => {
            delete serviceContext.params.auto_scaling;
            const errors = ecsFargate.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'auto_scaling' section is required`);
        });

        it('should require the min_tasks value in the auto_scaling section', () => {
            delete serviceContext.params.auto_scaling.min_tasks;
            const errors = ecsFargate.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'min_tasks' parameter is required`);
        });

        it('should require the max_tasks value in the auto_scaling section', () => {
            delete serviceContext.params.auto_scaling.max_tasks;
            const errors = ecsFargate.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'max_tasks' parameter is required`);
        });

        it('should require the type parameter when load_balancer section is present', () => {
            delete serviceContext.params.load_balancer!.type;
            const errors = ecsFargate.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'type' parameter is required`);
        });

        it('should require the https_certificate parameter when load_balancers type is https', () => {
            delete serviceContext.params.load_balancer!.https_certificate;
            const errors = ecsFargate.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'https_certificate' parameter is required`);
        });

        it('should validate dns hostnames', () => {
            serviceContext.params.load_balancer!.dns_names = ['invalid hostname'];
            const errors = ecsFargate.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'dns_names' values must be valid hostnames`);
        });

        it('should require the container section be present', () => {
            delete serviceContext.params.containers;
            const errors = ecsFargate.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`You must specify at least one container`);
        });

        it('should require the name parameter in the container section', () => {
            delete serviceContext.params.containers[0].name;
            const errors = ecsFargate.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'name' parameter is required`);
        });

        it('should not allow more than one container to have routing specified', () => {
            serviceContext.params.containers.push({
                name: 'othercontainer',
                port_mappings: [5000],
                routing: {
                    base_path: '/myotherpath'
                }
            });
            const errors = ecsFargate.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`You may not specify a 'routing' section in more than one container`);
        });

        it('should require the port_mappings parameter when routing is specified', () => {
            delete serviceContext.params.containers[0].port_mappings;
            const errors = ecsFargate.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'port_mappings' parameter is required`);
        });

        it('should return no errors on a successful configuration', () => {
            const errors = ecsFargate.check(serviceContext, []);
            expect(errors.length).to.equal(0);
        });

        it('should return no errors when \'log_retention_in_days\' is a number', () => {
            serviceContext.params.log_retention_in_days = 30;

            const errors = ecsFargate.check(serviceContext, []);
            expect(errors).to.have.lengthOf(0);
        });
    });

    describe('preDeploy', () => {
        it('should create a security group and add ingress to self and SSH bastion', async () => {
            const preDeployContext = new PreDeployContext(serviceContext);
            const groupId = 'FakeSgGroupId';
            preDeployContext.securityGroups.push({
                GroupId: groupId
            });
            const createSgStub = sandbox.stub(preDeployPhaseCommon, 'preDeployCreateSecurityGroup').resolves(preDeployContext);

            const retContext = await ecsFargate.preDeploy(serviceContext);
            expect(retContext).to.be.instanceof(PreDeployContext);
            expect(retContext.securityGroups.length).to.equal(1);
            expect(retContext.securityGroups[0].GroupId).to.equal(groupId);
            expect(createSgStub.callCount).to.equal(1);
        });
    });

    describe('deploy', () => {
        function getOwnPreDeployContextForDeploy(ownServiceContext: ServiceContext<FargateServiceConfig>) {
            const ownPreDeployContext = new PreDeployContext(ownServiceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: 'FakeSgId'
            });
            return ownPreDeployContext;
        }

        function getDependenciesDeployContextsForDeploy(app: string, env: string) {
            const dependenciesDeployContexts = [];
            const dependency1ServiceName = 'Dependency1Service';
            const dependency1ServiceType = 'dynamodb';
            const dependency1Params = { type: 'dynamodb' };
            const dependency1DeployContext = new DeployContext(new ServiceContext(app, env, dependency1ServiceName, dependency1ServiceType, dependency1Params, accountConfig));
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
            const dependency2DeployContext = new DeployContext(new ServiceContext(app, env, dependency2ServiceName, dependency2ServiceType, dependency2Params, accountConfig));
            dependenciesDeployContexts.push(dependency2DeployContext);
            const scriptContents = 'SOME SCRIPT';
            dependency2DeployContext.scripts.push(scriptContents);
            return dependenciesDeployContexts;
        }

        it('should deploy the Fargate service stack', async () => {
            const ownPreDeployContext = getOwnPreDeployContextForDeploy(serviceContext);
            const dependenciesDeployContexts = getDependenciesDeployContextsForDeploy(appName, envName);

            // Stub out AWS calls
            const createDefaultClusterStub = sandbox.stub(ecsCalls, 'createDefaultClusterIfNotExists').resolves({});
            const getHostedZonesStub = sandbox.stub(route53calls, 'listHostedZones').resolves([{
                Id: '1',
                Name: 'myapp.byu.edu.'
            }, {
                Id: '2',
                Name: 'myapp.internal.'
            }]);
            const deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').resolves({});

            // Run the test
            const deployContext = await ecsFargate.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployStackStub.callCount).to.equal(1);
            expect(createDefaultClusterStub.callCount).to.equal(1);
            expect(getHostedZonesStub.callCount).to.equal(1);

            // DNS name setup
            expect(deployStackStub.firstCall.args[1]).to.include('myapp.byu.edu');
            expect(deployStackStub.firstCall.args[1]).to.include('HostedZoneId: 1');
            expect(deployStackStub.firstCall.args[1]).to.include('myapp.internal');

            // Container Logging Setup
            expect(deployStackStub.firstCall.args[1]).to.include('awslogs');
            expect(deployStackStub.firstCall.args[1]).to.include('LogConfiguration');
            expect(deployStackStub.firstCall.args[1]).to.include(`LogGroupName: fargate/${appName}-${envName}-FakeService`);
        });
    });

    describe('unPreDeploy', () => {
        it('should delete the security group', async () => {
            const unPreDeployStub = sandbox.stub(deletePhasesCommon, 'unPreDeploySecurityGroup').resolves(new UnPreDeployContext(serviceContext));

            const unPreDeployContext = await ecsFargate.unPreDeploy(serviceContext);
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployStub.callCount).to.equal(1);
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await ecsFargate.unDeploy(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
