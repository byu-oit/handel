const accountConfig = require('../../../lib/util/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const ecs = require('../../../lib/services/ecs');
const deployersCommon = require('../../../lib/services/deployers-common');
const ecsCalls = require('../../../lib/aws/ecs-calls');
const ec2Calls = require('../../../lib/aws/ec2-calls');
const cloudformationCalls = require('../../../lib/aws/cloudformation-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('ecs deployer', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('check', function() {
        it('should require the image_name parameter', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                port_mappings: [5000]
            })
            let errors = ecs.check(serviceContext);
            expect(errors[0]).to.include("'image_name' parameter is required");
        });

        it('should require the port_mappings parameter', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                image_name: "SomeImage"
            })
            let errors = ecs.check(serviceContext);
            expect(errors[0]).to.include("'port_mappings' parameter is required");
        });
    });

    describe('preDeploy', function() {
        it('should create a security group and add ingress to self and SSH bastion', function() {
            let groupId = "FakeSgGroupId";
            let createSecurityGroupIfNotExistsStub = sandbox.stub(ec2Calls, 'createSecurityGroupIfNotExists');
            createSecurityGroupIfNotExistsStub.returns(Promise.resolve({}));
            let addIngressRuleToSgIfNotExistsStub = sandbox.stub(ec2Calls, 'addIngressRuleToSgIfNotExists');
            addIngressRuleToSgIfNotExistsStub.returns(Promise.resolve({
                GroupId: groupId
            }))
            let getSecurityGroupByIdStub = sandbox.stub(ec2Calls, 'getSecurityGroupById');
            getSecurityGroupByIdStub.returns(Promise.resolve('sg-fakeid'));
            
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return ecs.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                    expect(preDeployContext.securityGroups.length).to.equal(1);
                    expect(preDeployContext.securityGroups[0].GroupId).to.equal(groupId);
                    expect(createSecurityGroupIfNotExistsStub.calledOnce).to.be.true;
                    expect(addIngressRuleToSgIfNotExistsStub.calledTwice).to.be.true;
                    expect(getSecurityGroupByIdStub.calledOnce).to.be.true;
                });
        });
    });

    describe('bind', function() {
        it('should do nothing and just return an empty BindContext', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return ecs.bind(serviceContext)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('deploy', function() {
        function getOwnServiceContextForDeploy(appName, envName, deployVersion) {
            //Set up ServiceContext
            let ownServiceName = "FakeService";
            let ownServiceType = "ecs";
            let ownParams = {
                image_name: "MyImage",
                port_mappings: [5000]
            };
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
            dependency1DeployContext.outputs[envVarName] = envVarValue;
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

        it('should create a new ECS service CF stack when it doesnt exist', function() {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            
            //Set up ServiceContext
            let ownServiceContext = getOwnServiceContextForDeploy();

            //Set up PreDeployContext
            let ownPreDeployContext = getOwnPreDeployContextForDeploy(ownServiceContext);

            //Set up dependencies DeployContexts
            let dependenciesDeployContexts = getDependenciesDeployContextsForDeploy(appName, envName, deployVersion);            

            //Stub out AWS calls
            let createCustomRoleForServiceStub = sandbox.stub(deployersCommon, 'createCustomRoleForService');
            createCustomRoleForServiceStub.returns(Promise.resolve({
                Arn: "FakeRoleArn" 
            }))
            let registerTaskDefinitionStub = sandbox.stub(ecsCalls, 'registerTaskDefinition');
            registerTaskDefinitionStub.returns(Promise.resolve({
                taskDefinitionArn: "FakeTaskDefArn"
            }));
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack');
            getStackStub.returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudformationCalls, 'createStack');
            createStackStub.returns(Promise.resolve({}));

            //Run the test
            return ecs.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(createCustomRoleForServiceStub.calledOnce).to.be.true;
                    expect(registerTaskDefinitionStub.calledOnce).to.be.true;
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(createStackStub.calledOnce).to.be.true;
                });
        });

        it('should update the CF service stack when it exists', function() {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            
            //Set up ServiceContext
            let ownServiceContext = getOwnServiceContextForDeploy();

            //Set up PreDeployContext
            let ownPreDeployContext = getOwnPreDeployContextForDeploy(ownServiceContext);

            //Set up dependencies DeployContexts
            let dependenciesDeployContexts = getDependenciesDeployContextsForDeploy(appName, envName, deployVersion);            

            //Stub out AWS calls
            let createCustomRoleForServiceStub = sandbox.stub(deployersCommon, 'createCustomRoleForService');
            createCustomRoleForServiceStub.returns(Promise.resolve({
                Arn: "FakeRoleArn" 
            }))
            let registerTaskDefinitionStub = sandbox.stub(ecsCalls, 'registerTaskDefinition');
            registerTaskDefinitionStub.returns(Promise.resolve({
                taskDefinitionArn: "FakeTaskDefArn"
            }));
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack');
            getStackStub.returns(Promise.resolve({}));
            let updateStackStub = sandbox.stub(cloudformationCalls, 'updateStack');
            updateStackStub.returns(Promise.resolve({}));

            //Run the test
            return ecs.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(createCustomRoleForServiceStub.calledOnce).to.be.true;
                    expect(registerTaskDefinitionStub.calledOnce).to.be.true;
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(updateStackStub.calledOnce).to.be.true;
            });
        });
    });
});