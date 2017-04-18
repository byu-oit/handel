const accountConfig = require('../../../lib/util/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const lambda = require('../../../lib/services/lambda');
const cloudFormationCalls = require('../../../lib/aws/cloudformation-calls');
const lambdaCalls = require('../../../lib/aws/lambda-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const ConsumeEventsContext = require('../../../lib/datatypes/consume-events-context');
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

    describe('getPreDeployContextForExternalRef', function() {
        it('should return an empty preDeployContext', function() {
            let externalRefServiceContext = new ServiceContext("FakeName", "FakeEnv", "FakeService", "FakeType", "1", {});
            return lambda.getPreDeployContextForExternalRef(externalRefServiceContext)
                .then(externalRefPreDeployContext => {
                    expect(externalRefPreDeployContext).to.be.instanceof(PreDeployContext);
                });
        })
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

    describe('getBindContextForExternalRef', function() {
        it('should return an empty bind context', function() {
            return lambda.getBindContextForExternalRef(null, null, null, null)
                .then(externalBindContext => {
                    expect(externalBindContext).to.be.instanceof(BindContext);
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
            let functionArn = "FakeFunctionArn";
            let functionName = "FakeFunction";
            let createStackStub = sandbox.stub(cloudFormationCalls, 'createStack').returns(Promise.resolve({
                Outputs: [
                    {
                        OutputKey: 'FunctionArn',
                        OutputValue: functionArn,
                    },
                    {
                        OutputKey: 'FunctionName',
                        OutputValue: functionName
                    }
                ]
            }));

            let ownServiceContext = getServiceContext();
            let ownPreDeployContext = getPreDeployContext(ownServiceContext);
            let dependenciesDeployContexts = getDependenciesDeployContexts();

            return lambda.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.eventOutputs.lambdaArn).to.equal(functionArn);
                    expect(deployContext.eventOutputs.lambdaName).to.equal(functionName);
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
            let functionArn = "FakeFunctionArn";
            let functionName = "FakeFunction";
            let updateStackStub = sandbox.stub(cloudFormationCalls, 'updateStack').returns(Promise.resolve({
                Outputs: [
                    {
                        OutputKey: 'FunctionArn',
                        OutputValue: functionArn,
                    },
                    {
                        OutputKey: 'FunctionName',
                        OutputValue: functionName
                    }
                ]
            }));

            let ownServiceContext = getServiceContext();
            let ownPreDeployContext = getPreDeployContext(ownServiceContext);
            let dependenciesDeployContexts = getDependenciesDeployContexts();

            return lambda.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.eventOutputs.lambdaArn).to.equal(functionArn);
                    expect(deployContext.eventOutputs.lambdaName).to.equal(functionName);
                    expect(createCustomRoleStub.calledOnce).to.be.true;
                    expect(uploadArtifactStub.calledOnce).to.be.true;
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(updateStackStub.calledOnce).to.be.true;
                });
        });
    });

    describe('getDeployContextForExternalRef', function() {
        it('should return the DeployContext if the lambda has already been deployed', function() {
            let externalRefServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "efs", "1", {});
            let functionArn = "FakeFunctionArn";
            let functionName = "FakeFunction";
            let getStackStub = sandbox.stub(cloudFormationCalls, 'getStack').returns(Promise.resolve({
                Outputs: [
                    {
                        OutputKey: 'FunctionArn',
                        OutputValue: functionArn,
                    },
                    {
                        OutputKey: 'FunctionName',
                        OutputValue: functionName
                    }
                ]
            }));

            return lambda.getDeployContextForExternalRef(externalRefServiceContext)
                .then(externalDeployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(externalDeployContext).to.be.instanceof(DeployContext);
                    expect(externalDeployContext.eventOutputs.lambdaArn).to.equal(functionArn);
                    expect(externalDeployContext.eventOutputs.lambdaName).to.equal(functionName);
                });
        })

        it('should return an error if the lambda hasnt already been deployed', function() {
            let externalRefServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "efs", "1", {});
            let getStackStub = sandbox.stub(cloudFormationCalls, 'getStack').returns(Promise.resolve(null));

            return lambda.getDeployContextForExternalRef(externalRefServiceContext)
                .then(externalDeployContext => {
                    expect(true).to.equal(false); //Should not get here
                })
                .catch(err => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(err.message).to.contain("You must deploy it independently first");
                })
        });
    });

    describe('consumeEvents', function() {
        it('should add permissions for the sns service type', function() {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let ownServiceContext = new ServiceContext(appName, envName, "consumerService", "lambda", deployVersion, {});
            let ownDeployContext = new DeployContext(ownServiceContext);
            ownDeployContext.eventOutputs.lambdaName = "FakeLambda";

            let producerServiceContext = new ServiceContext(appName, envName, "producerService", "sns", deployVersion, {});
            let producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.principal = "FakePrincipal";
            producerDeployContext.eventOutputs.topicArn = "FakeTopicArn";

            let addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').returns(Promise.resolve({}));

            return lambda.consumeEvents(ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext)
                .then(consumeEventsContext => {
                    expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
                    expect(addLambdaPermissionStub.calledOnce).to.be.true;
                });
        });

        it('should return an error for any other service type', function() {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let ownServiceContext = new ServiceContext(appName, envName, "consumerService", "lambda", deployVersion, {});
            let ownDeployContext = new DeployContext(ownServiceContext);
            ownDeployContext.eventOutputs.lambdaName = "FakeLambda";

            let producerServiceContext = new ServiceContext(appName, envName, "producerService", "efs", deployVersion, {});
            let producerDeployContext = new DeployContext(producerServiceContext);

            let addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').returns(Promise.resolve({}));

            return lambda.consumeEvents(ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext)
                .then(consumeEventsContext => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Unsupported event producer type given");
                    expect(addLambdaPermissionStub.notCalled).to.be.true;
                });
        });
    });

    describe('getConsumeEventsContextForExternalRef', function() {
        it('should return the ConsumeEventsContext when the consumeEvents phase has already run for the service', function() {
            let ownServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "lambda", "1", {});
            let ownDeployContext = new DeployContext(ownServiceContext);
            let externalServiceContext = new ServiceContext("FakeExternalApp", "FakeExternalEnv", "FakeExternalService", "sns", "1", {});
            let externalDeployContext = new DeployContext(externalServiceContext);
            externalDeployContext.eventOutputs.principal = "FakePrincipal";
            externalDeployContext.eventOutputs.topicArn = "FakeArn";

            let getLambdaPermissionStub = sandbox.stub(lambdaCalls, 'getLambdaPermission').returns(Promise.resolve({}))

            return lambda.getConsumeEventsContextForExternalRef(ownServiceContext, ownDeployContext, externalServiceContext, externalDeployContext)
                .then(consumeEventsContext => {
                    expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
                    expect(getLambdaPermissionStub.calledOnce).to.be.true;
                });
        });

        it('should return an error if consumeEvents hasnt run yet', function() {
            let ownServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "lambda", "1", {});
            let ownDeployContext = new DeployContext(ownServiceContext);
            let externalServiceContext = new ServiceContext("FakeExternalApp", "FakeExternalEnv", "FakeExternalService", "sns", "1", {});
            let externalDeployContext = new DeployContext(externalServiceContext);
            externalDeployContext.eventOutputs.principal = "FakePrincipal";
            externalDeployContext.eventOutputs.topicArn = "FakeArn";

            let getLambdaPermissionStub = sandbox.stub(lambdaCalls, 'getLambdaPermission').returns(Promise.resolve(null))

            return lambda.getConsumeEventsContextForExternalRef(ownServiceContext, ownDeployContext, externalServiceContext, externalDeployContext)
                .then(consumeEventsContext => {
                    expect(true).to.be.false;
                })
                .catch(err => {
                    expect(getLambdaPermissionStub.calledOnce).to.be.true;
                    expect(err.message).to.contain("ConsumeEvents not run for external service");
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