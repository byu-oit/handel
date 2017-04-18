const accountConfig = require('../../../lib/util/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const ecs = require('../../../lib/services/ecs');
const deployersCommon = require('../../../lib/services/deployers-common');
const ec2Calls = require('../../../lib/aws/ec2-calls');
const iamCalls = require('../../../lib/aws/iam-calls');
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
        it('should require the port_mappings parameter', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let errors = ecs.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("'port_mappings' parameter is required");
        });

        describe('when routing element is present', function() {
            it("should require the 'type' parameter", function() {
                let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                    port_mappings: [5000],
                    routing: {}
                });
                let errors = ecs.check(serviceContext);
                expect(errors.length).to.equal(1);
                expect(errors[0]).to.include("The 'type' field is required");
            });

            it("should require the 'https_certificate' parameter when the type is https", function() {
                let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                    port_mappings: [5000],
                    routing: {
                        type: 'https'
                    }
                });
                let errors = ecs.check(serviceContext);
                expect(errors.length).to.equal(1);
                expect(errors[0]).to.include("The 'https_certificate' element is required");
            });
        });

        it("should return no errors on a successful configuration", function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                port_mappings: [5000],
                routing: {
                    type: 'https',
                    https_certificate: 'FakeCert'
                }
            });
            let errors = ecs.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('preDeploy', function() {
        it('should create a security group and add ingress to self and SSH bastion', function() {
            let groupId = "FakeSgGroupId";
            let createSecurityGroupStub = sandbox.stub(deployersCommon, 'createSecurityGroupForService').returns(Promise.resolve({
                GroupId: groupId
            }));
            
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return ecs.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                    expect(preDeployContext.securityGroups.length).to.equal(1);
                    expect(preDeployContext.securityGroups[0].GroupId).to.equal(groupId);
                    expect(createSecurityGroupStub.calledOnce).to.be.true;
                });
        });
    });

    describe('getPreDeployContextForExternalRef', function() {
        it('should return the PreDeployContext if predeploy has been run for the service', function() {
            let externalServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "ecs", "1", {});
            let getSecurityGroupStub = sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve({}));

            return ecs.getPreDeployContextForExternalRef(externalServiceContext)
                .then(externalPreDeployContext => {
                    expect(externalPreDeployContext).to.be.instanceof(PreDeployContext);
                    expect(externalPreDeployContext.securityGroups.length).to.equal(1);
                    expect(getSecurityGroupStub.calledOnce).to.be.true;
                });
        });

        it('should return an error if predeploy hasnt been run for the service yet', function() {
            let externalServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "ecs", "1", {});
            let getSecurityGroupStub = sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve(null));

            return ecs.getPreDeployContextForExternalRef(externalServiceContext)
                .then(externalPreDeployContext => {
                    expect(true).to.equal(false); //Should not get here
                })
                .catch(err => {
                    expect(getSecurityGroupStub.calledOnce).to.be.true;
                    expect(err.message).to.contain('ECS - Resources from PreDeploy not found');
                });
        });
    })

    describe('bind', function() {
        it('should do nothing and just return an empty BindContext', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return ecs.bind(serviceContext)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('getBindContextForExternalRef', function() {
        it('should return an empty bind context', function() {
            return ecs.getBindContextForExternalRef(null, null, null, null)
                .then(externalBindContext => {
                    expect(externalBindContext).to.be.instanceof(BindContext);
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

        it('should create a new ECS service CF stack when it doesnt exist', function() {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            
            //Set up ServiceContext
            let ownServiceContext = getOwnServiceContextForDeploy(appName, envName, deployVersion);

            //Set up PreDeployContext
            let ownPreDeployContext = getOwnPreDeployContextForDeploy(ownServiceContext);

            //Set up dependencies DeployContexts
            let dependenciesDeployContexts = getDependenciesDeployContextsForDeploy(appName, envName, deployVersion);            

            //Stub out AWS calls
            let fakeArn = "FakeArn";
            let createCustomRoleForServiceStub = sandbox.stub(deployersCommon, 'createCustomRoleForService').returns(Promise.resolve({
                Arn: "FakeRoleArn" 
            }));
            let createRoleStub = sandbox.stub(iamCalls, 'createRoleIfNotExists').returns(Promise.resolve({}));
            let createPolicyStub = sandbox.stub(iamCalls, 'createPolicyIfNotExists').returns(Promise.resolve({
                Arn: fakeArn
            }))
            let attachPolicyStub = sandbox.stub(iamCalls, 'attachPolicyToRole').returns(Promise.resolve({}));
            let getRoleStub = sandbox.stub(iamCalls, 'getRole').returns(Promise.resolve({
                Arn: fakeArn
            }))
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudformationCalls, 'createStack').returns(Promise.resolve({}));

            //Run the test
            return ecs.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(createCustomRoleForServiceStub.calledOnce).to.be.true;
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(createStackStub.calledOnce).to.be.true;
                });
        });

        it('should update the CF service stack when it exists', function() {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            
            //Set up ServiceContext
            let ownServiceContext = getOwnServiceContextForDeploy(appName, envName, deployVersion);

            //Set up PreDeployContext
            let ownPreDeployContext = getOwnPreDeployContextForDeploy(ownServiceContext);

            //Set up dependencies DeployContexts
            let dependenciesDeployContexts = getDependenciesDeployContextsForDeploy(appName, envName, deployVersion);            

            //Stub out AWS calls
            let createCustomRoleForServiceStub = sandbox.stub(deployersCommon, 'createCustomRoleForService').returns(Promise.resolve({
                Arn: "FakeRoleArn" 
            }));
            let fakeArn = "FakeArn";
            let createRoleStub = sandbox.stub(iamCalls, 'createRoleIfNotExists').returns(Promise.resolve({}));
            let createPolicyStub = sandbox.stub(iamCalls, 'createPolicyIfNotExists').returns(Promise.resolve({
                Arn: fakeArn
            }))
            let attachPolicyStub = sandbox.stub(iamCalls, 'attachPolicyToRole').returns(Promise.resolve({}));
            let getRoleStub = sandbox.stub(iamCalls, 'getRole').returns(Promise.resolve({
                Arn: fakeArn
            }))
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let updateStackStub = sandbox.stub(cloudformationCalls, 'updateStack').returns(Promise.resolve({}));

            //Run the test
            return ecs.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(createCustomRoleForServiceStub.calledOnce).to.be.true;
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(updateStackStub.calledOnce).to.be.true;
            });
        });
    });

    describe('getDeployContextForExternalRef', function() {
        it('should return the DeployContext if the service has been deployed', function() {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let externalServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "dynamodb", "1", {});            
            return ecs.getDeployContextForExternalRef(externalServiceContext)
                .then(externalDeployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(externalDeployContext).to.be.instanceof(DeployContext);
                });
        });

        it('should return an error if the service hasnt been deployed yet', function() {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let externalServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "dynamodb", "1", {});            
            return ecs.getDeployContextForExternalRef(externalServiceContext)
                .then(externalDeployContext => {
                    expect(true).to.equal(false); //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain('is not deployed!');
                    expect(getStackStub.calledOnce).to.be.true;
                });
        });
    });

    describe('consumeEvents', function() {
        it('should throw an error because ECS cant consume event services', function() {
            return ecs.consumeEvents(null, null, null, null)
                .then(consumeEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("ECS service doesn't consume events");
                });
        });
    });

    describe('getConsumeEventsContextForExternalRef', function() {
        it('should throw an error because ECS cant consume event services', function() {
            return ecs.getConsumeEventsContextForExternalRef(null, null, null, null)
                .then(externalConsumeEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("ECS service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function() {
        it('should throw an error because ECS cant produce events for other services', function() {
            return ecs.produceEvents(null, null, null, null)
                .then(produceEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("ECS service doesn't produce events");
                });
        });
    });
});