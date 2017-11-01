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
const s3 = require('../../../dist/services/s3');
const ServiceContext = require('../../../dist/datatypes/service-context');
const DeployContext = require('../../../dist/datatypes/deploy-context');
const PreDeployContext = require('../../../dist/datatypes/pre-deploy-context');
const deployPhaseCommon = require('../../../dist/common/deploy-phase-common');
const deletePhasesCommon = require('../../../dist/common/delete-phases-common');
const UnDeployContext = require('../../../dist/datatypes/un-deploy-context');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../../dist/account-config/account-config');

describe('s3 deployer', function () {
    let sandbox;
    let ownServiceContext;

    beforeEach(function () {
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(accountConfig => {
                ownServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "s3", {}, accountConfig);
                sandbox = sinon.sandbox.create();
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require the versioning parameter to be a certain value when present', function () {
            ownServiceContext.params = {
                bucket_name: 'somename',
                versioning: 'othervalue'
            }
            let errors = s3.check(ownServiceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'versioning' parameter must be either 'enabled' or 'disabled'");
        });

        it('should work when there are no configuration errors', function () {
            ownServiceContext.params = {
                bucket_name: 'somename',
                versioning: 'enabled'
            }
            let errors = s3.check(ownServiceContext);
            expect(errors.length).to.equal(0);
        });

        it('should fail if PublicReadWrite set as an ACL', function () {
            ownServiceContext.params = {
                bucket_name: 'somename',
                bucket_acl: 'PublicReadWrite'
            }
            let errors = s3.check(ownServiceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'bucket_acl' parameter must be 'AuthenticatedRead', 'AwsExecRead', 'BucketOwnerRead', 'BucketOwnerFullControl', 'LogDeliveryWrite', 'Private' or 'PublicRead'");
        });

        it('should work with valid bucket_acl', function () {
            ownServiceContext.params = {
                bucket_name: 'somename',
                bucket_acl: 'PublicRead'
            }
            let errors = s3.check(ownServiceContext);
            expect(errors.length).to.equal(0);
        });

        describe('deploy', function () {
            it('should deploy the bucket', function () {
                let bucketName = "my-bucket";
                ownServiceContext.params = { bucket_name: bucketName }
                let preDeployContext = new PreDeployContext(ownServiceContext);

                let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                    Outputs: [{
                        OutputKey: 'BucketName',
                        OutputValue: bucketName
                    }]
                }));

                return s3.deploy(ownServiceContext, preDeployContext, [])
                    .then(deployContext => {
                        expect(deployStackStub.callCount).to.equal(2);
                        expect(deployContext).to.be.instanceof(DeployContext);
                        expect(deployContext.policies.length).to.equal(2);
                        expect(deployContext.environmentVariables["FAKESERVICE_BUCKET_NAME"]).to.equal(bucketName);
                        expect(deployContext.environmentVariables["FAKESERVICE_BUCKET_URL"]).to.contain(bucketName);
                        expect(deployContext.environmentVariables["FAKESERVICE_REGION_ENDPOINT"]).to.exist;
                    });
            });
        });

        describe('unDeploy', function () {
            it('should undeploy the stack', function () {
                let bucketName = "my-bucket";
                ownServiceContext.params = { bucket_name: bucketName }

                let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(new UnDeployContext(ownServiceContext)));

                return s3.unDeploy(ownServiceContext)
                    .then(unDeployContext => {
                        expect(unDeployContext).to.be.instanceof(UnDeployContext);
                        expect(unDeployStackStub.calledOnce).to.be.ture;
                    });
            });
        });
    });
});