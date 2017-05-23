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
const s3 = require('../../../lib/services/s3');
const cloudfFormationCalls = require('../../../lib/aws/cloudformation-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const deployersCommon = require('../../../lib/common/deployers-common');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const UnBindContext = require('../../../lib/datatypes/un-bind-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('s3 deployer', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require the versioning parameter to be a certain value when present', function () {
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

        it('should work when there are no configuration errors', function () {
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

    describe('preDeploy', function () {
        it('should return an empty predeploy context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return s3.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                });
        });
    });

    describe('bind', function () {
        it('should return an empty bind context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return s3.bind(serviceContext)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('deploy', function () {
        let appName = "FakeApp";
        let envName = "FakeEnv";
        let deployVersion = "1";
        let bucketName = "my-bucket";
        let serviceContext = new ServiceContext(appName, envName, "FakeService", "s3", deployVersion, {
            bucket_name: bucketName
        });
        let preDeployContext = new PreDeployContext(serviceContext);

        it('should create a new bucket when it doesnt exist', function () {
            let getStackStub = sandbox.stub(cloudfFormationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudfFormationCalls, 'createStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'BucketName',
                    OutputValue: bucketName
                }]
            }))

            return s3.deploy(serviceContext, preDeployContext, [])
                .then(deployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(createStackStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.policies.length).to.equal(2);
                    expect(deployContext.environmentVariables["S3_FAKEAPP_FAKEENV_FAKESERVICE_BUCKET_NAME"]).to.equal(bucketName);
                    expect(deployContext.environmentVariables["S3_FAKEAPP_FAKEENV_FAKESERVICE_BUCKET_URL"]).to.contain(bucketName);
                    expect(deployContext.environmentVariables["S3_FAKEAPP_FAKEENV_FAKESERVICE_REGION_ENDPOINT"]).to.exist;
                });
        });

        it('should update an existing bucket when it exists', function () {
            let getStackStub = sandbox.stub(cloudfFormationCalls, 'getStack').returns(Promise.resolve({}));
            let updateStackStub = sandbox.stub(cloudfFormationCalls, 'updateStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'BucketName',
                    OutputValue: bucketName
                }]
            }))

            return s3.deploy(serviceContext, preDeployContext, [])
                .then(deployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(updateStackStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.policies.length).to.equal(2);
                    expect(deployContext.environmentVariables["S3_FAKEAPP_FAKEENV_FAKESERVICE_BUCKET_NAME"]).to.equal(bucketName);
                    expect(deployContext.environmentVariables["S3_FAKEAPP_FAKEENV_FAKESERVICE_BUCKET_URL"]).to.contain(bucketName);
                    expect(deployContext.environmentVariables["S3_FAKEAPP_FAKEENV_FAKESERVICE_REGION_ENDPOINT"]).to.exist;
                });
        });
    });

    describe('consumeEvents', function () {
        it('should return an error since it cant consume events', function () {
            return s3.consumeEvents(null, null, null, null)
                .then(() => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("S3 service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function () {
        it('should return an error since it doesnt yet produce events', function () {
            return s3.produceEvents(null, null, null, null)
                .then(() => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("S3 service doesn't currently produce events");
                });
        });
    });

    describe('unPreDeploy', function () {
        it('should return an empty UnPreDeploy context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "s3", "1", {});
            return s3.unPreDeploy(serviceContext)
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                });
        });
    });

    describe('unBind', function () {
        it('should return an empty UnBind context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "s3", "1", {});
            return s3.unBind(serviceContext)
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "s3", "1", {});
            let unDeployStackStub = sandbox.stub(deployersCommon, 'unDeployCloudFormationStack').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return s3.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});