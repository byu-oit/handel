const accountConfig = require('../../../lib/util/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const lambda = require('../../../lib/services/lambda');
const cloudFormationCalls = require('../../../lib/aws/cloudformation-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const deployersCommon = require('../../../lib/services/deployers-common');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('lambda deployer', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('check', function() {
        it('should require the path_to_code parameter', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                handler: 'index.handler',
                runtime: 'nodejs6.11'
            });
            let errors = lambda.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'path_to_code' parameter is required");
        });

        it('should require the handler parameter', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                path_to_code: '.',
                runtime: 'nodejs6.11'
            });
            let errors = lambda.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'handler' parameter is required");
        });

        it('should require the runtime parameter', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                path_to_code: '.',
                handler: 'index.handler'
            });
            let errors = lambda.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'runtime' parameter is required");
        });

        it('should work when things are configured properly', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                path_to_code: '.',
                runtime: 'nodejs6.11',
                handler: 'index.handler'
            });
            let errors = lambda.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('preDeploy', function() {
        it('should return an empty predeploy context since it doesnt do anything', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return lambda.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                    expect(preDeployContext.appName).to.equal(serviceContext.appName);
                });
        });
    });

    describe('bind', function() {
        it('should return an empty bind context since it doesnt do anything', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return lambda.bind(serviceContext)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                    expect(bindContext.dependencyServiceContext.appName).to.equal(serviceContext.appName);
                });
        });
    });

    describe('deploy', function() {
        function getServiceContext() {
            return new ServiceContext("FakeApp", "FakeEnv", "FakeService", "lambda", "1", {
                memory: 256,
                timeout: 5,
                path_to_code: ".",
                handler: 'index.handler',
                runtime: 'nodejs6.11',
                environment_variables: {
                    MY_FIRST_VAR: 'my_first_value'
                }
            });
        }

        function getPreDeployContext(serviceContext) {
            return new PreDeployContext(serviceContext);
        }

        function getDependenciesDeployContexts() {
            let dependenciesDeployContexts = [];

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService2", "dynamodb", "1", {
                
            });
            let deployContext = new DeployContext(serviceContext);
            deployContext.environmentVariables['INJECTED_VAR'] = 'injectedValue';
            deployContext.policies.push({});

            return dependenciesDeployContexts;
        }

        
        it('should create the service when it doesnt already exist', function() {
            let createCustomRoleStub = sandbox.stub(deployersCommon, 'createCustomRoleForService').returns(Promise.resolve({
                Arn: "FakeArn"
            }));
            let uploadArtifactStub = sandbox.stub(deployersCommon, 'uploadDeployableArtifactToHandelBucket').returns(Promise.resolve({
                Key: "FakeKey",
                Bucket: "FakeBucket"
            }));
            let getStackStub = sandbox.stub(cloudFormationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudFormationCalls, 'createStack').returns(Promise.resolve({}));

            let ownServiceContext = getServiceContext();
            let ownPreDeployContext = getPreDeployContext(ownServiceContext);
            let dependenciesDeployContexts = getDependenciesDeployContexts();

            return lambda.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(createCustomRoleStub.calledOnce).to.be.true;
                    expect(uploadArtifactStub.calledOnce).to.be.true;
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(createStackStub.calledOnce).to.be.true;
                });
        });

        it('should update the service when it already exists', function() {
            let createCustomRoleStub = sandbox.stub(deployersCommon, 'createCustomRoleForService').returns(Promise.resolve({
                Arn: "FakeArn"
            }));
            let uploadArtifactStub = sandbox.stub(deployersCommon, 'uploadDeployableArtifactToHandelBucket').returns(Promise.resolve({
                Key: "FakeKey",
                Bucket: "FakeBucket"
            }));
            let getStackStub = sandbox.stub(cloudFormationCalls, 'getStack').returns(Promise.resolve({}));
            let updateStackStub = sandbox.stub(cloudFormationCalls, 'updateStack').returns(Promise.resolve({}));

            let ownServiceContext = getServiceContext();
            let ownPreDeployContext = getPreDeployContext(ownServiceContext);
            let dependenciesDeployContexts = getDependenciesDeployContexts();

            return lambda.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(createCustomRoleStub.calledOnce).to.be.true;
                    expect(uploadArtifactStub.calledOnce).to.be.true;
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(updateStackStub.calledOnce).to.be.true;
                });
        });
    });

    describe('consumerEvents', function() {
        it('should throw an error because EFS doesnt consume event services', function() {
            return lambda.consumeEvents(null, null, null, null)
                .then(consumeEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Lambda service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function() {
        it('should throw an error because EFS doesnt produce events for other services', function() {
            return lambda.produceEvents(null, null, null, null)
                .then(produceEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Lambda service doesn't produce events");
                });
        });
    });
});