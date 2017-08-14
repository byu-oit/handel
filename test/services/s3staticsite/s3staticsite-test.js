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
const s3StaticSite = require('../../../lib/services/s3staticsite');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const s3Calls = require('../../../lib/aws/s3-calls');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const bindPhaseCommon = require('../../../lib/common/bind-phase-common');
const preDeployPhaseCommon = require('../../../lib/common/pre-deploy-phase-common');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const UnBindContext = require('../../../lib/datatypes/un-bind-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('s3staticsite deployer', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require the path_to_code parameter', function () {
            let ownServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "s3staticsite", "1", {});
            let errors = s3StaticSite.check(ownServiceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'path_to_code' parameter is required");
        });

        it('should work when all required parameters are given', function () {
            let ownServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "s3staticsite", "1", {
                path_to_code: '.'
            });
            let errors = s3StaticSite.check(ownServiceContext);
            expect(errors.length).to.equal(0);
        })
    });

    describe('preDeploy', function () {
        it('should return an empty predeploy context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let preDeployNotRequiredStub = sandbox.stub(preDeployPhaseCommon, 'preDeployNotRequired').returns(Promise.resolve(new PreDeployContext(serviceContext)));

            return s3StaticSite.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployNotRequiredStub.callCount).to.equal(1);
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                });
        });
    });

    describe('bind', function () {
        it('should return an empty bind context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let bindNotRequiredStub = sandbox.stub(bindPhaseCommon, 'bindNotRequired').returns(Promise.resolve(new BindContext({}, {})));

            return s3StaticSite.bind(serviceContext)
                .then(bindContext => {
                    expect(bindNotRequiredStub.callCount).to.equal(1);
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('deploy', function () {
        let ownServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "s3staticsite", "1", {
            path_to_code: '.'
        });
        let ownPreDeployContext = new PreDeployContext(ownServiceContext);

        it('should deploy the static site bucket', function () {
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack');
            deployStackStub.onCall(0).returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'BucketName',
                    OutputValue: 'logging-bucket'
                }]
            }));
            deployStackStub.onCall(1).returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'BucketName',
                    OutputValue: 'my-static-site-bucket'
                }]
            }));
            let uploadDirectoryStub = sandbox.stub(s3Calls, 'uploadDirectory').returns(Promise.resolve({}));

            return s3StaticSite.deploy(ownServiceContext, ownPreDeployContext, [])
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployStackStub.callCount).to.equal(2);
                    expect(uploadDirectoryStub.callCount).to.equal(1);
                });
        });
    });

    describe('consumeEvents', function () {
        it('should return an error since it cant consume events', function () {
            return s3StaticSite.consumeEvents(null, null, null, null)
                .then(() => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("S3 Static Site service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function () {
        it('should return an error since it doesnt yet produce events', function () {
            return s3StaticSite.produceEvents(null, null, null, null)
                .then(() => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("S3 Static Site service doesn't produce events");
                });
        });
    });

    describe('unPreDeploy', function () {
        it('should return an empty UnPreDeploy context', function () {
            let unPreDeployNotRequiredStub = sandbox.stub(deletePhasesCommon, 'unPreDeployNotRequired').returns(Promise.resolve(new UnPreDeployContext({})));
            return s3StaticSite.unPreDeploy({})
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeployNotRequiredStub.callCount).to.equal(1);
                });
        });
    });

    describe('unBind', function () {
        it('should return an empty UnBind context', function () {
            let unBindNotRequiredStub = sandbox.stub(deletePhasesCommon, 'unBindNotRequired').returns(Promise.resolve(new UnBindContext({})));
            return s3StaticSite.unBind({})
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                    expect(unBindNotRequiredStub.callCount).to.equal(1);
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "s3staticsite", "1", {});
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return s3StaticSite.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});
