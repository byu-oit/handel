const accountConfig = require('../../../lib/util/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const s3 = require('../../../lib/services/s3');
const cloudfFormationCalls = require('../../../lib/aws/cloudformation-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('efs deployer', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('check', function() {
        it('should require a bucket_name parameter', function() {
            let serviceContext = {
                params: {}
            }
            let errors = s3.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'bucket_name' parameter is required");
        });

        it('should require the versioning parameter to be a certain value when present', function() {
            let serviceContext = {
                params: {
                    bucket_name: 'somename',
                    versioning: 'othervalue'
                }
            }
            let errors = s3.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'versioning' parameter must be either 'enabled' or 'disabled'");
        });

        it('should work when there are no configuration errors', function() {
            let serviceContext = {
                params: {
                    bucket_name: 'somename',
                    versioning: 'enabled'
                }
            }
            let errors = s3.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('preDeploy', function() {
        it('should return an empty predeploy context', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return s3.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                });
        });
    });

    describe('bind', function() {
        it('should return an empty bind context', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return s3.bind(serviceContext)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('deploy', function() {
        let appName = "FakeApp";
        let envName = "FakeEnv";
        let deployVersion = "1";
        let bucketName = "my-bucket";
        let serviceContext = new ServiceContext(appName, envName, "FakeService", "s3", deployVersion, {
            bucket_name: bucketName
        });
        let preDeployContext = new PreDeployContext(serviceContext);

        it('should create a new bucket when it doesnt exist', function() {
            let getStackStub = sandbox.stub(cloudfFormationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudfFormationCalls, 'createStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'BucketName',
                    OutputValue: bucketName
                }]
            }))

            return s3.deploy(serviceContext, preDeployContext, [])
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.policies.length).to.equal(2);
                    expect(deployContext.environmentVariables["S3_FAKEAPP_FAKEENV_FAKESERVICE_BUCKET_NAME"]).to.equal(bucketName);
                    expect(deployContext.environmentVariables["S3_FAKEAPP_FAKEENV_FAKESERVICE_BUCKET_URL"]).to.contain(bucketName);
                    expect(deployContext.environmentVariables["S3_FAKEAPP_FAKEENV_FAKESERVICE_REGION_ENDPOINT"]).to.exist;
                });
        });

        it('should update an existing bucket when it exists', function() {
            let getStackStub = sandbox.stub(cloudfFormationCalls, 'getStack').returns(Promise.resolve({}));
            let updateStackStub = sandbox.stub(cloudfFormationCalls, 'updateStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'BucketName',
                    OutputValue: bucketName
                }]
            }))

            return s3.deploy(serviceContext, preDeployContext, [])
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.policies.length).to.equal(2);
                    expect(deployContext.environmentVariables["S3_FAKEAPP_FAKEENV_FAKESERVICE_BUCKET_NAME"]).to.equal(bucketName);
                    expect(deployContext.environmentVariables["S3_FAKEAPP_FAKEENV_FAKESERVICE_BUCKET_URL"]).to.contain(bucketName);
                    expect(deployContext.environmentVariables["S3_FAKEAPP_FAKEENV_FAKESERVICE_REGION_ENDPOINT"]).to.exist;
                });
        });
    });

    describe('consumeEvents', function() {
        it('should return an error since it cant consume events', function() {
            return s3.consumeEvents(null, null, null, null)
                .then(() => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("S3 service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function() {
        it('should return an error since it doesnt yet produce events', function() {
            return s3.produceEvents(null, null, null, null)
                .then(() => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("S3 service doesn't currently produce events");
                });
        });
    });
});