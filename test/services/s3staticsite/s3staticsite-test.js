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
        });

        describe('versioning', function () {
            const valid = ['enabled', 'disabled'];
            for (let validValue of valid) {
                it(`should allow '${validValue}'`, function () {
                    ownServiceContext.params.versioning = validValue;

                    let errors = s3StaticSite.check(ownServiceContext);
                    expect(errors).to.be.empty;
                });
            }
            it("should reject invalid values", function () {
                ownServiceContext.params.versioning = 'off';
                let errors = s3StaticSite.check(ownServiceContext);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include("'versioning' parameter must be either 'enabled' or 'disabled'")
            });
        });
        describe('cloudfront_logging', function () {
            const valid = ['enabled', 'disabled'];
            for (let validValue of valid) {
                it(`should allow '${validValue}'`, function () {
                    ownServiceContext.params.cloudfront_logging = validValue;

                    let errors = s3StaticSite.check(ownServiceContext);
                    expect(errors).to.be.empty;
                });
            }
            it("should reject invalid values", function () {
                ownServiceContext.params.cloudfront_logging = 'off';
                let errors = s3StaticSite.check(ownServiceContext);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include("'cloudfront_logging' parameter must be either 'enabled' or 'disabled'")
            });
        });
        describe('cloudfront_price_class', function () {
            const valid = ['100', '200', 'all'];
            for (let validValue of valid) {
                it(`should allow '${validValue}'`, function () {
                    ownServiceContext.params.cloudfront_price_class = validValue;

                    let errors = s3StaticSite.check(ownServiceContext);
                    expect(errors).to.be.empty;
                });
            }
            it("should reject invalid values", function () {
                ownServiceContext.params.cloudfront_price_class = 'off';
                let errors = s3StaticSite.check(ownServiceContext);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include("'cloudfront_price_class' parameter must be one of '100', '200', or 'all'");
            });
        });
        describe('TTLs', function () {
            const ttlFields = ['min', 'max', 'default'];
            const aliases = ['second', 'minute', 'hour', 'day', 'year'];
            for (let field of ttlFields.map(it => `cloudfront_${it}_ttl`)) {
                it(`should allow numbers in '${field}`, function() {
                    ownServiceContext.params[field] = 100;
                    let errors = s3StaticSite.check(ownServiceContext);
                    expect(errors).to.be.empty;
                });
                for (let alias of aliases) {
                    it(`should allow ${alias} aliases in '${field}`, function() {
                        ownServiceContext.params[field] = `2 ${alias}`;
                        let errors = s3StaticSite.check(ownServiceContext);
                        expect(errors).to.be.empty;

                        //plural
                        ownServiceContext.params[field] = `2 ${alias}s`;
                        errors = s3StaticSite.check(ownServiceContext);
                        expect(errors).to.be.empty;
                    });
                }
                it(`should reject invalid values in '${field}`, function() {
                    ownServiceContext.params[field] = 'foobar';

                    let errors = s3StaticSite.check(ownServiceContext);
                    expect(errors).to.have.lengthOf(1);
                    expect(errors[0]).to.include(`'${field}' parameter must be a valid TTL value`);
                });
            }
        });
        describe('dns_name', function () {
            it('should allow valid hostnames', function() {
                ownServiceContext.params.dns_name = 'valid.dns.name.com';

                let errors = s3StaticSite.check(ownServiceContext);
                expect(errors).to.be.empty;
            });
            it("should reject invalid values", function() {
                ownServiceContext.params.dns_name = 'invalid hostname';

                let errors = s3StaticSite.check(ownServiceContext);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include("'dns_name' parameter must be a valid DNS hostname");
            });
        });
    });

    describe('deploy', function () {
        let ownPreDeployContext;

        beforeEach(function () {
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
