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
const ecs = require('../../../lib/services/ecs');
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const cloudformationCalls = require('../../../lib/aws/cloudformation-calls');
const ec2Calls = require('../../../lib/aws/ec2-calls');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const preDeployPhaseCommon = require('../../../lib/common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../../lib/common/bind-phase-common');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const UnBindContext = require('../../../lib/datatypes/un-bind-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const sinon = require('sinon');
const expect = require('chai').expect;

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
        https_certificate: 'fakeid'
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

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        let configToCheck;
        let serviceContextToCheck;

        beforeEach(function () {
            configToCheck = JSON.parse(JSON.stringify(VALID_ECS_CONFIG))
            serviceContextToCheck = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "ecs", "1", configToCheck);
        });

        it('should require the auto_scaling section', function () {
            delete configToCheck.auto_scaling;
            let errors = ecs.check(serviceContextToCheck);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'auto_scaling' section is required`);
        });

        it('should require the min_tasks value in the auto_scaling section', function () {
            delete configToCheck.auto_scaling.min_tasks;
            let errors = ecs.check(serviceContextToCheck);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'min_tasks' parameter is required`);
        });

        it('should require the max_tasks value in the auto_scaling section', function () {
            delete configToCheck.auto_scaling.max_tasks;
            let errors = ecs.check(serviceContextToCheck);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'max_tasks' parameter is required`);
        });

        it('should require the type parameter when load_balancer section is present', function () {
            delete configToCheck.load_balancer.type;
            let errors = ecs.check(serviceContextToCheck);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'type' parameter is required`);
        });

        it('should require the https_certificate parameter when load_balancers type is https', function () {
            delete configToCheck.load_balancer.https_certificate;
            let errors = ecs.check(serviceContextToCheck);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'https_certificate' parameter is required`);
        });

        it('should require the container section be present', function () {
            delete configToCheck.containers;
            let errors = ecs.check(serviceContextToCheck);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`You must specify at least one container`);
        });

        it('should require the name parameter in the container section', function () {
            delete configToCheck.containers[0].name;
            let errors = ecs.check(serviceContextToCheck);
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
            let errors = ecs.check(serviceContextToCheck);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`You may not specify a 'routing' section in more than one container`);
        });

        it('should require the port_mappings parameter when routing is specified', function () {
            delete configToCheck.containers[0].port_mappings;
            let errors = ecs.check(serviceContextToCheck);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`'port_mappings' parameter is required`);
        });

        it("should return no errors on a successful configuration", function () {
            let errors = ecs.check(serviceContextToCheck);
            expect(errors.length).to.equal(0);
        });
    });

    describe('preDeploy', function () {
        it('should create a security group and add ingress to self and SSH bastion', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
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

    describe('bind', function () {
        it('should do nothing and just return an empty BindContext', function () {
            let bindNotRequiredStub = sandbox.stub(bindPhaseCommon, 'bindNotRequired').returns(Promise.resolve(new BindContext({}, {})));

            return ecs.bind({}, {}, {}, {})
                .then(bindContext => {
                    expect(bindNotRequiredStub.callCount).to.equal(1);
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('deploy', function () {
        function getOwnServiceContextForDeploy(appName, envName, deployVersion) {
            //Set up ServiceContext
            let ownServiceName = "FakeService";
            let ownServiceType = "ecs";
            let ownParams = VALID_ECS_CONFIG;
            let ownServiceContext = new ServiceContext(appName, envName, ownServiceName, ownServiceType, deployVersion, ownParams);
            return ownServiceContext;
        }

        function getOwnPreDeployContextForDeploy(ownServiceContext) {
            let ownPreDeployContext = new PreDeployContext(ownServiceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: "FakeSgId"
            });
            return ownPreDeployContext;
        }

        function getDependenciesDeployContextsForDeploy(appName, envName, deployVersion) {
            let dependenciesDeployContexts = [];
            let dependency1ServiceName = "Dependency1Service";
            let dependency1ServiceType = "dynamodb";
            let dependency1Params = {}
            let dependency1DeployContext = new DeployContext(new ServiceContext(appName, envName, dependency1ServiceName, dependency1ServiceType, deployVersion, dependency1Params));
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
            let dependency2DeployContext = new DeployContext(new ServiceContext(appName, envName, dependency2ServiceName, dependency2ServiceType, deployVersion, dependency2Params));
            dependenciesDeployContexts.push(dependency2DeployContext);
            let scriptContents = "SOME SCRIPT";
            dependency2DeployContext.scripts.push(scriptContents);
            return dependenciesDeployContexts;
        }

        it('should deploy the ECS service stack', function () {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";

            let ownServiceContext = getOwnServiceContextForDeploy(appName, envName, deployVersion);
            let ownPreDeployContext = getOwnPreDeployContextForDeploy(ownServiceContext);
            let dependenciesDeployContexts = getDependenciesDeployContextsForDeploy(appName, envName, deployVersion);

            //Stub out AWS calls
            let getLatestAmiByNameStub = sandbox.stub(ec2Calls, 'getLatestAmiByName').returns(Promise.resolve({
                ImageId: 'FakeAmiId'
            }));
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let uploadDirStub = sandbox.stub(deployPhaseCommon, 'uploadDirectoryToHandelBucket').returns(Promise.resolve({}));
            let createStackStub = sandbox.stub(cloudformationCalls, 'createStack').returns(Promise.resolve({}));
            let createCustomRoleStub = sandbox.stub(deployPhaseCommon, 'createCustomRole').returns(Promise.resolve({}));
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({}));

            //Run the test
            return ecs.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(getStackStub.callCount).to.equal(1);
                    expect(uploadDirStub.callCount).to.equal(1);
                    expect(getLatestAmiByNameStub.callCount).to.equal(1);
                    expect(createStackStub.callCount).to.equal(1);
                    expect(deployStackStub.callCount).to.equal(1);
                    expect(createCustomRoleStub.callCount).to.equal(1);
                });
        });
    });

    describe('consumeEvents', function () {
        it('should throw an error because ECS cant consume event services', function () {
            return ecs.consumeEvents(null, null, null, null)
                .then(consumeEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("ECS service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function () {
        it('should throw an error because ECS cant produce events for other services', function () {
            return ecs.produceEvents(null, null, null, null)
                .then(produceEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("ECS service doesn't produce events");
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

    describe('unBind', function () {
        it('should return an empty UnBind context', function () {
            let unBindNotRequiredStub = sandbox.stub(deletePhasesCommon, 'unBindNotRequired').returns(Promise.resolve(new UnBindContext({})));
            return ecs.unBind({})
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                    expect(unBindNotRequiredStub.callCount).to.equal(1);
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "ecs", "1", {});
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployCloudFormationStack').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return ecs.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});