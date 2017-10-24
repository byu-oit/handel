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
const ecs = require('../../../lib/services/ecs');
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const cloudformationCalls = require('../../../lib/aws/cloudformation-calls');
const ec2Calls = require('../../../lib/aws/ec2-calls');
const ecsCalls = require('../../../lib/aws/ecs-calls');
const autoScalingCalls = require('../../../lib/aws/auto-scaling-calls');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const preDeployPhaseCommon = require('../../../lib/common/pre-deploy-phase-common');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const route53calls = require('../../../lib/aws/route53-calls');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../../lib/account-config/account-config');

const VALID_ECS_CONFIG = {
    cluster: {
        key_name: 'fakekey',
        instance_type: 'm3.medium'
    },
    auto_scaling: {
        min_tasks: 2,
        max_tasks: 2
    },
    load_balancer: {
        type: 'https',
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
                health_check_url: '/healthcheck'
            }
        }
    ]
}

describe('ecs deployer', function () {
    let sandbox;
    let serviceContext;
    let appName = "FakeApp";
    let envName = "FakeEnv";

    beforeEach(function () {
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext(appName, envName, "FakeService", "ecs", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        let configToCheck;

        beforeEach(function () {
            configToCheck = JSON.parse(JSON.stringify(VALID_ECS_CONFIG))
            serviceContext.params = configToCheck;
        });

        it('should require the auto_scaling section', function () {
            delete configToCheck.auto_scaling;
            let errors = ecs.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'auto_scaling' section is required`);
        });

        it('should require the min_tasks value in the auto_scaling section', function () {
            delete configToCheck.auto_scaling.min_tasks;
            let errors = ecs.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'min_tasks' parameter is required`);
        });

        it('should require the max_tasks value in the auto_scaling section', function () {
            delete configToCheck.auto_scaling.max_tasks;
            let errors = ecs.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'max_tasks' parameter is required`);
        });

        it('should require the type parameter when load_balancer section is present', function () {
            delete configToCheck.load_balancer.type;
            let errors = ecs.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'type' parameter is required`);
        });

        it('should require the https_certificate parameter when load_balancers type is https', function () {
            delete configToCheck.load_balancer.https_certificate;
            let errors = ecs.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'https_certificate' parameter is required`);
        });

        it('should validate dns hostnames', function () {
            configToCheck.load_balancer.dns_names = ['invalid hostname'];
            let errors = ecs.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'dns_names' values must be valid hostnames`);
        });

        it('should require the container section be present', function () {
            delete configToCheck.containers;
            let errors = ecs.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`You must specify at least one container`);
        });

        it('should require the name parameter in the container section', function () {
            delete configToCheck.containers[0].name;
            let errors = ecs.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'name' parameter is required`);
        });

        it('should not allow more than one container to have routing specified', function () {
            configToCheck.containers.push({
                name: 'othercontainer',
                port_mappings: [5000],
                routing: {
                    base_path: '/myotherpath'
                }
            })
            let errors = ecs.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`You may not specify a 'routing' section in more than one container`);
        });

        it('should require the port_mappings parameter when routing is specified', function () {
            delete configToCheck.containers[0].port_mappings;
            let errors = ecs.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'port_mappings' parameter is required`);
        });

        it("should return no errors on a successful configuration", function () {
            let errors = ecs.check(serviceContext);
            expect(errors.length).to.equal(0);
        });

        describe("'logging' validation", function () {
            it("should allow 'enabled'", function () {
                serviceContext.params.logging = 'enabled';
                let errors = ecs.check(serviceContext);
                expect(errors).to.be.empty;
            });

            it("should allow 'disabled'", function () {
                serviceContext.params.logging = 'disabled';
                let errors = ecs.check(serviceContext);
                expect(errors).to.be.empty;
            });

            it("should reject anything else", function () {
                serviceContext.params.logging = 'something else';
                let errors = ecs.check(serviceContext);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.contain("'logging' parameter must be either 'enabled' or 'disabled'")
            });
        });

        it("should require that 'log_retention_in_days' be a number", function () {
            serviceContext.params.log_retention_in_days = 'a number';

            let errors = ecs.check(serviceContext);
            expect(errors).to.have.lengthOf(1);
            expect(errors[0]).to.contain("'log_retention_in_days' parameter must be a number")
        });
    });

    describe('preDeploy', function () {
        it('should create a security group and add ingress to self and SSH bastion', function () {
            let preDeployContext = new PreDeployContext(serviceContext);
            let groupId = "FakeSgGroupId";
            preDeployContext.securityGroups.push({
                GroupId: groupId
            });
            let createSgStub = sandbox.stub(preDeployPhaseCommon, 'preDeployCreateSecurityGroup').returns(Promise.resolve(preDeployContext));

            return ecs.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                    expect(preDeployContext.securityGroups.length).to.equal(1);
                    expect(preDeployContext.securityGroups[0].GroupId).to.equal(groupId);
                    expect(createSgStub.callCount).to.equal(1);
                });
        });
    });

    describe('deploy', function () {
        beforeEach(function () {
            serviceContext.params = VALID_ECS_CONFIG;
        })

        function getOwnPreDeployContextForDeploy(ownServiceContext) {
            let ownPreDeployContext = new PreDeployContext(ownServiceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: "FakeSgId"
            });
            return ownPreDeployContext;
        }

        function getDependenciesDeployContextsForDeploy(appName, envName) {
            let dependenciesDeployContexts = [];
            let dependency1ServiceName = "Dependency1Service";
            let dependency1ServiceType = "dynamodb";
            let dependency1Params = {}
            let dependency1DeployContext = new DeployContext(new ServiceContext(appName, envName, dependency1ServiceName, dependency1ServiceType, dependency1Params, {}));
            dependenciesDeployContexts.push(dependency1DeployContext);
            let envVarName = 'DYNAMODB_SOME_VAR';
            let envVarValue = 'SomeValue'
            dependency1DeployContext.environmentVariables[envVarName] = envVarValue;
            dependency1DeployContext.policies.push({
                "Sid": `DynamoAccess`,
                "Effect": "Allow",
                "Action": [
                    "dynamodb:SomeAction",
                ],
                "Resource": [
                    "someArn"
                ]
            });

            let dependency2ServiceName = "Dependency2Service";
            let dependency2ServiceType = "efs";
            let dependency2Params = {}
            let dependency2DeployContext = new DeployContext(new ServiceContext(appName, envName, dependency2ServiceName, dependency2ServiceType, dependency2Params, {}));
            dependenciesDeployContexts.push(dependency2DeployContext);
            let scriptContents = "SOME SCRIPT";
            dependency2DeployContext.scripts.push(scriptContents);
            return dependenciesDeployContexts;
        }

        it('should deploy the ECS service stack', function () {
            let ownPreDeployContext = getOwnPreDeployContextForDeploy(serviceContext);
            let dependenciesDeployContexts = getDependenciesDeployContextsForDeploy(appName, envName);

            //Stub out AWS calls
            let getLatestAmiByNameStub = sandbox.stub(ec2Calls, 'getLatestAmiByName').returns(Promise.resolve({
                ImageId: 'FakeAmiId'
            }));
            let getHostedZonesStub = sandbox.stub(route53calls, 'listHostedZones').returns(Promise.resolve([{
                Id: '1',
                Name: 'myapp.byu.edu.'
            }, {
                Id: '2',
                Name: 'myapp.internal.'
            }]));
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let uploadDirStub = sandbox.stub(deployPhaseCommon, 'uploadDirectoryToHandelBucket').returns(Promise.resolve({}));
            let createStackStub = sandbox.stub(cloudformationCalls, 'createStack').returns(Promise.resolve({}));
            let createCustomRoleStub = sandbox.stub(deployPhaseCommon, 'createCustomRole').returns(Promise.resolve({}));
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({}));

            let listECSinstancesStub = sandbox.stub(ecsCalls,'listInstances').returns(Promise.resolve({ec2:[]}));
            let describeASGlaunchStub = sandbox.stub(autoScalingCalls,'describeLaunchConfigurationsByInstanceIds').returns(Promise.resolve({LaunchConfigurations:[]}));

            //Run the test
            return ecs.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(getStackStub.callCount).to.equal(2);
                    expect(uploadDirStub.callCount).to.equal(2);
                    expect(getLatestAmiByNameStub.callCount).to.equal(1);
                    expect(createStackStub.callCount).to.equal(2);
                    expect(deployStackStub.callCount).to.equal(1);
                    expect(createCustomRoleStub.callCount).to.equal(1);
                    expect(listECSinstancesStub.callCount).to.equal(1);
                    expect(describeASGlaunchStub.callCount).to.equal(1);

                    //DNS name setup
                    expect(deployStackStub.firstCall.args[1]).to.include('myapp.byu.edu');
                    expect(deployStackStub.firstCall.args[1]).to.include('HostedZoneId: 1');
                    expect(deployStackStub.firstCall.args[1]).to.include('myapp.internal');

                    //Container Logging Setup
                    expect(deployStackStub.firstCall.args[1]).to.include('awslogs');
                    expect(deployStackStub.firstCall.args[1]).to.include('LogConfiguration');
                    expect(deployStackStub.firstCall.args[1]).to.include(`LogGroupName: ecs/${appName}-${envName}-FakeService`);
                });
        });

        it('should deploy a new ECS service stack', function () {
            let ownPreDeployContext = getOwnPreDeployContextForDeploy(serviceContext);
            let dependenciesDeployContexts = getDependenciesDeployContextsForDeploy(appName, envName);

            //Stub out AWS calls
            let getLatestAmiByNameStub = sandbox.stub(ec2Calls, 'getLatestAmiByName').returns(Promise.resolve({
                ImageId: 'FakeAmiId'
            }));
            let getHostedZonesStub = sandbox.stub(route53calls, 'listHostedZones').returns(Promise.resolve([{
                Id: '1',
                Name: 'myapp.byu.edu.'
            }, {
                Id: '2',
                Name: 'myapp.internal.'
            }]));
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let uploadDirStub = sandbox.stub(deployPhaseCommon, 'uploadDirectoryToHandelBucket').returns(Promise.resolve({}));
            let createStackStub = sandbox.stub(cloudformationCalls, 'createStack').returns(Promise.resolve({}));
            let createCustomRoleStub = sandbox.stub(deployPhaseCommon, 'createCustomRole').returns(Promise.resolve({}));
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({}));

            let listECSinstancesStub = sandbox.stub(ecsCalls,'listInstances').returns(Promise.resolve(null));
            let describeASGlaunchStub = sandbox.stub(autoScalingCalls,'describeLaunchConfigurationsByInstanceIds').returns(Promise.resolve({LaunchConfigurations:[]}));

            //Run the test
            return ecs.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(getStackStub.callCount).to.equal(2);
                    expect(uploadDirStub.callCount).to.equal(2);
                    expect(getLatestAmiByNameStub.callCount).to.equal(1);
                    expect(createStackStub.callCount).to.equal(2);
                    expect(deployStackStub.callCount).to.equal(1);
                    expect(createCustomRoleStub.callCount).to.equal(1);
                    expect(listECSinstancesStub.callCount).to.equal(1);
                    expect(describeASGlaunchStub.callCount).to.equal(0);

                    //DNS name setup
                    expect(deployStackStub.firstCall.args[1]).to.include('myapp.byu.edu');
                    expect(deployStackStub.firstCall.args[1]).to.include('HostedZoneId: 1');
                    expect(deployStackStub.firstCall.args[1]).to.include('myapp.internal');

                    //Container Logging Setup
                    expect(deployStackStub.firstCall.args[1]).to.include('awslogs');
                    expect(deployStackStub.firstCall.args[1]).to.include('LogConfiguration');
                    expect(deployStackStub.firstCall.args[1]).to.include(`LogGroupName: ecs/${appName}-${envName}-FakeService`);
                });
        });
    });

    describe('unPreDeploy', function () {
        it('should delete the security group', function () {
            let unPreDeployStub = sandbox.stub(deletePhasesCommon, 'unPreDeploySecurityGroup').returns(Promise.resolve(new UnPreDeployContext({})));

            return ecs.unPreDeploy({})
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeployStub.callCount).to.equal(1);
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return ecs.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});
