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
const s3StaticSite = require('../../../lib/services/s3staticsite');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const s3Calls = require('../../../lib/aws/s3-calls');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const sinon = require('sinon');
const expect = require('chai').expect;

const accountConfig = require('../../../lib/common/account-config')(`${__dirname}/../../test-account-config.yml`);

describe('s3staticsite deployer', function () {
    let sandbox;
    let ownServiceContext;

    beforeEach(function () {
        let serviceParams = {
            path_to_code: "."
        }
        ownServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "s3staticsite", "1", serviceParams, accountConfig);
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require the path_to_code parameter', function () {
            delete ownServiceContext.params.path_to_code;
            let errors = s3StaticSite.check(ownServiceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'path_to_code' parameter is required");
        });

        it('should work when all required parameters are given', function () {
            let errors = s3StaticSite.check(ownServiceContext);
            expect(errors.length).to.equal(0);
        })
    });

    describe('deploy', function () {
        let ownPreDeployContext;

        beforeEach(function() {
            ownPreDeployContext = new PreDeployContext(ownServiceContext);
        });

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

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(new UnDeployContext(ownServiceContext)));

            return s3StaticSite.unDeploy(ownServiceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});
