const accountConfig = require('../../../lib/util/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const apigateway = require('../../../lib/services/apigateway');
const cloudFormationCalls = require('../../../lib/aws/cloudformation-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const sinon = require('sinon');
const expect = require('chai').expect;
const deployersCommon = require('../../../lib/services/deployers-common');

describe('dynamodb deployer', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('check', function() {
        it("should require the 'path_to_code' param", function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                lambda_runtime: 'FakeRuntime',
                handler_function: 'FakeFunction'
            });

            let errors = apigateway.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'path_to_code' parameter is required");
        });

        it("should require the 'lambda_runtime' param", function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                path_to_code: './',
                handler_function: 'FakeFunction'
            });

            let errors = apigateway.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'lambda_runtime' parameter is required");
        });

        it("should require the 'handler_function' param", function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                path_to_code: './',
                lambda_runtime: 'FakeRuntime'
            });

            let errors = apigateway.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'handler_function' parameter is required");
        });
    });

    describe('preDeploy', function() {
        it('should return an empty preDeploy context', function() {
            let serviceContext = new ServiceContext("FakeName", "FakeEnv", "FakeService", "FakeType", "1", {});
            return apigateway.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                });
        });
    });

    describe('bind', function() {
        it('should return an empty bind context', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return apigateway.bind(serviceContext)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('deploy', function() {
        function getOwnServiceContext(appName, envName, deployVersion) {
            let ownServiceName = "OwnService";
            let ownServiceType = "apigateway";
            let ownServiceParams = {
                path_to_code: `${__dirname}/mytestartifact.war`,
                lambda_runtime: 'nodejs6.10',
                handler_runtime: 'index.handler'
            };
            let ownServiceContext = new ServiceContext(appName, envName, ownServiceName, ownServiceType, deployVersion, ownServiceParams);
            return ownServiceContext;
        }

        function getDependencyDeployContexts(appName, envName, deployVersion) {
            let dependenciesDeployContexts = [];
            let dependencyServiceName = "DependencyService";
            let dependencyServiceType = "dynamodb";
            let dependencyServiceParams = {}
            let dependencyServiceContext = new ServiceContext(appName, envName, dependencyServiceName, dependencyServiceType, deployVersion, dependencyServiceParams);
            let dependencyDeployContext = new DeployContext(dependencyServiceContext);
            dependenciesDeployContexts.push(dependencyDeployContext);
            return dependenciesDeployContexts;
        }

        it('should create the new service if it doesnt already exist', function() {
            //Set up input parameters
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let ownServiceContext = getOwnServiceContext(appName, envName, deployVersion);
            let ownPreDeployContext = new PreDeployContext(ownServiceContext);
            let dependenciesDeployContexts = getDependencyDeployContexts(appName, envName, deployVersion);

            //Stub out dependent services
            let bucketName = "FakeBucket";
            let bucketKey = "FakeBucketKey";
            let uploadFileToHandelBucketStub = sandbox.stub(deployersCommon, 'uploadFileToHandelBucket').returns(Promise.resolve({
                Bucket: bucketName,
                Key: bucketKey
            }));
            let roleArn = "FakeArn";
            let createCustomRoleStub = sandbox.stub(deployersCommon, 'createCustomRoleForService').returns(Promise.resolve({
                Arn: roleArn
            }));
            let getStackStub = sandbox.stub(cloudFormationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudFormationCalls, 'createStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'RestApiId',
                    OutputValue: 'someApiId'
                }]
            }));

            return apigateway.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(createCustomRoleStub.calledOnce).to.be.true;
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(createStackStub.calledOnce).to.be.true;
                });
        });

        it('should update the service if it already exists', function() {
            //Set up input parameters
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let ownServiceContext = getOwnServiceContext(appName, envName, deployVersion);
            let ownPreDeployContext = new PreDeployContext(ownServiceContext);
            let dependenciesDeployContexts = getDependencyDeployContexts(appName, envName, deployVersion);

            //Stub out dependent services
            let bucketName = "FakeBucket";
            let bucketKey = "FakeBucketKey";
            let uploadFileToHandelBucketStub = sandbox.stub(deployersCommon, 'uploadFileToHandelBucket').returns(Promise.resolve({
                Bucket: bucketName,
                Key: bucketKey
            }));
            let roleArn = "FakeArn";
            let createCustomRoleStub = sandbox.stub(deployersCommon, 'createCustomRoleForService').returns(Promise.resolve({
                Arn: roleArn
            }));
            let getStackStub = sandbox.stub(cloudFormationCalls, 'getStack').returns(Promise.resolve({}));
            let updateStackStub = sandbox.stub(cloudFormationCalls, 'updateStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'RestApiId',
                    OutputValue: 'someApiId'
                }]
            }));

            return apigateway.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(createCustomRoleStub.calledOnce).to.be.true;
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(updateStackStub.calledOnce).to.be.true;
                });
        });
    });
});