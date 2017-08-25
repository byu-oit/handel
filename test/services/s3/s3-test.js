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
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
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

        it('should fail if PublicReadWrite set as an ACL', function () {
            let serviceContext = {
                params: {
                    bucket_name: 'somename',
                    bucket_acl: 'PublicReadWrite'
                }
            }
            let errors = s3.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'bucket_acl' parameter must be 'AuthenticatedRead', 'AwsExecRead', 'BucketOwnerRead', 'BucketOwnerFullControl', 'LogDeliveryWrite', 'Private' or 'PublicRead'");
        });

        it('should work with valid bucket_acl', function () {
            let serviceContext = {
                params: {
                    bucket_name: 'somename',
                    bucket_acl: 'PublicRead'
                }
            }
            let errors = s3.check(serviceContext);
            expect(errors.length).to.equal(0);
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

            it('should deploy the bucket', function () {
                let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                    Outputs: [{
                        OutputKey: 'BucketName',
                        OutputValue: bucketName
                    }]
                }));

                return s3.deploy(serviceContext, preDeployContext, [])
                    .then(deployContext => {
                        expect(deployStackStub.callCount).to.equal(2);
                        expect(deployContext).to.be.instanceof(DeployContext);
                        expect(deployContext.policies.length).to.equal(2);
                        expect(deployContext.environmentVariables["S3_FAKEAPP_FAKEENV_FAKESERVICE_BUCKET_NAME"]).to.equal(bucketName);
                        expect(deployContext.environmentVariables["S3_FAKEAPP_FAKEENV_FAKESERVICE_BUCKET_URL"]).to.contain(bucketName);
                        expect(deployContext.environmentVariables["S3_FAKEAPP_FAKEENV_FAKESERVICE_REGION_ENDPOINT"]).to.exist;
                    });
            });
        });
        
        describe('unDeploy', function () {
            it('should undeploy the stack', function () {
                let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "s3", "1", {});
                let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(new UnDeployContext(serviceContext)));

                return s3.unDeploy(serviceContext)
                    .then(unDeployContext => {
                        expect(unDeployContext).to.be.instanceof(UnDeployContext);
                        expect(unDeployStackStub.calledOnce).to.be.ture;
                    });
            });
        });
    });
});