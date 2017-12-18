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
const s3StaticSite = require('../../../dist/services/s3staticsite');
const ServiceContext = require('../../../dist/datatypes/service-context').ServiceContext;
const DeployContext = require('../../../dist/datatypes/deploy-context').DeployContext;
const s3Calls = require('../../../dist/aws/s3-calls');
const PreDeployContext = require('../../../dist/datatypes/pre-deploy-context').PreDeployContext;
const deployPhaseCommon = require('../../../dist/common/deploy-phase-common');
const deletePhasesCommon = require('../../../dist/common/delete-phases-common');
const UnDeployContext = require('../../../dist/datatypes/un-deploy-context').UnDeployContext;
const route53calls = require('../../../dist/aws/route53-calls');
const handlebarsUtils = require('../../../dist/common/handlebars-utils');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../../dist/account-config/account-config').default;

describe('s3staticsite deployer', function () {
    let sandbox;
    let ownServiceContext;

    beforeEach(function () {
        let serviceParams = {
            path_to_code: ".",
        };
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(accountConfig => {
                ownServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "s3staticsite", serviceParams, accountConfig);
                sandbox = sinon.sandbox.create();
            });
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
        describe('cloudfront.logging', function () {
            const valid = ['enabled', 'disabled'];
            for (let validValue of valid) {
                it(`should allow '${validValue}'`, function () {
                    ownServiceContext.params.cloudfront = { logging: validValue };

                    let errors = s3StaticSite.check(ownServiceContext);
                    expect(errors).to.be.empty;
                });
            }
            it("should reject invalid values", function () {
                ownServiceContext.params.cloudfront = { logging: 'off' };
                let errors = s3StaticSite.check(ownServiceContext);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include("'logging' parameter must be either 'enabled' or 'disabled'")
            });
        });
        describe('cloudfront.price_class', function () {
            const valid = ['100', '200', 'all'];
            for (let validValue of valid) {
                it(`should allow '${validValue}'`, function () {
                    ownServiceContext.params.cloudfront = { price_class: validValue };

                    let errors = s3StaticSite.check(ownServiceContext);
                    expect(errors).to.be.empty;
                });
            }
            it("should reject invalid values", function () {
                ownServiceContext.params.cloudfront = { price_class: 'off' };
                let errors = s3StaticSite.check(ownServiceContext);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include("'price_class' parameter must be one of '100', '200', or 'all'");
            });
        });
        describe('cloudfront TTLs', function () {
            const ttlFields = ['min', 'max', 'default'];
            const aliases = ['second', 'minute', 'hour', 'day', 'year'];
            for (let field of ttlFields.map(it => `${it}_ttl`)) {
                it(`should allow numbers in '${field}`, function () {
                    ownServiceContext.params.cloudfront = { [field]: 100 };
                    let errors = s3StaticSite.check(ownServiceContext);
                    expect(errors).to.be.empty;
                });
                for (let alias of aliases) {
                    it(`should allow ${alias} aliases in '${field}`, function () {
                        ownServiceContext.params.cloudfront = { [field]: `2 ${alias}` };
                        let errors = s3StaticSite.check(ownServiceContext);
                        expect(errors).to.be.empty;

                        //plural
                        ownServiceContext.params.cloudfront = { [field]: `2 ${alias}s` };
                        errors = s3StaticSite.check(ownServiceContext);
                        expect(errors).to.be.empty;
                    });
                }
                it(`should reject invalid values in '${field}`, function () {
                    ownServiceContext.params.cloudfront = { [field]: 'foobar' };

                    let errors = s3StaticSite.check(ownServiceContext);
                    expect(errors).to.have.lengthOf(1);
                    expect(errors[0]).to.include(`'${field}' parameter must be a valid TTL value`);
                });
            }
        });
        describe('cloudfront.dns_name', function () {
            it('should allow valid hostnames', function () {
                ownServiceContext.params.cloudfront = { dns_names: ['valid.dns.name.com'] };

                let errors = s3StaticSite.check(ownServiceContext);
                expect(errors).to.be.empty;
            });
            it("should reject invalid values", function () {
                ownServiceContext.params.cloudfront = { dns_names: ['invalid hostname', 'valid.dns.name.com'] };

                let errors = s3StaticSite.check(ownServiceContext);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include("'dns_name' parameter must be a valid DNS hostname");
            });
        });
    });

    describe('deploy', function () {
        let ownPreDeployContext;
        let handlebarsSpy;

        beforeEach(function () {
            ownPreDeployContext = new PreDeployContext(ownServiceContext);
            handlebarsSpy = sandbox.spy(handlebarsUtils, 'compileTemplate');
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
                    expect(handlebarsSpy.called).to.be.true;

                    let params = handlebarsSpy.lastCall.args[1];

                    expect(params.cloudfront).to.not.exist;
                });
        });

        describe('cloudfront', function () {
            let listHostedZonesStub;
            let deployStackStub;

            beforeEach(function () {
                ownServiceContext.params.cloudfront = {};
                listHostedZonesStub = sandbox.stub(route53calls, 'listHostedZones').returns(Promise.resolve([]));

                deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack');
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
                sandbox.stub(s3Calls, 'uploadDirectory').returns(Promise.resolve({}));

            });

            it('should deploy cloudfront with default parameters', function () {
                return s3StaticSite.deploy(ownServiceContext, ownPreDeployContext, [])
                    .then(deployContext => {
                        expect(deployContext).to.be.instanceof(DeployContext);
                        expect(deployStackStub.callCount).to.equal(2);
                        expect(handlebarsSpy.called).to.be.true;
                        let params = handlebarsSpy.lastCall.args[1];

                        expect(params).to.have.property('cloudfront')
                            .that.includes({
                                logging: true,
                                minTTL: 0,
                                maxTTL: 31536000,
                                defaultTTL: 86400,
                                priceClass: 'PriceClass_All'
                            }).and.has.property('setIPV6FunctionBody');
                    });
            });

            it('should allow DNS names to be set', function () {
                ownServiceContext.params.cloudfront.dns_names = ['test.dns.com'];

                listHostedZonesStub.returns(Promise.resolve([{
                    Name: 'dns.com.',
                    Id: 'dnscom'
                }]));

                return s3StaticSite.deploy(ownServiceContext, ownPreDeployContext, [])
                    .then(deployContext => {
                        expect(deployContext).to.be.instanceof(DeployContext);
                        expect(deployStackStub.callCount).to.equal(2);
                        expect(handlebarsSpy.called).to.be.true;
                        let params = handlebarsSpy.lastCall.args[1];

                        expect(params).to.have.property('cloudfront')
                            .which.has.property('dnsNames')
                            .which.deep.includes({
                                name: 'test.dns.com',
                                zoneId: 'dnscom'
                            });
                    });
            });

            it('should allow an HTTPS cert to be configured', function () {
                ownServiceContext.params.cloudfront.https_certificate = 'abc123';

                return s3StaticSite.deploy(ownServiceContext, ownPreDeployContext, [])
                    .then(deployContext => {
                        expect(deployContext).to.be.instanceof(DeployContext);
                        expect(deployStackStub.callCount).to.equal(2);
                        expect(handlebarsSpy.called).to.be.true;
                        let params = handlebarsSpy.lastCall.args[1];

                        expect(params).to.have.property('cloudfront')
                            .which.has.property('httpsCertificateId', 'abc123');
                    });
            });

            it('should allow cloudfront logging to be disabled', function () {
                ownServiceContext.params.cloudfront.logging = 'disabled';

                return s3StaticSite.deploy(ownServiceContext, ownPreDeployContext, [])
                    .then(deployContext => {
                        expect(deployContext).to.be.instanceof(DeployContext);
                        expect(deployStackStub.callCount).to.equal(2);
                        expect(handlebarsSpy.called).to.be.true;
                        let params = handlebarsSpy.lastCall.args[1];

                        expect(params).to.have.property('cloudfront')
                            .which.has.property('logging', false);
                    });
            });

            it('should allow cloudfront TTLs to be customized', function () {
                let cf = ownServiceContext.params.cloudfront;
                cf.min_ttl = '1 minute';
                cf.default_ttl = '2 hours';
                cf.max_ttl = '30days';

                return s3StaticSite.deploy(ownServiceContext, ownPreDeployContext, [])
                    .then(deployContext => {
                        expect(deployContext).to.be.instanceof(DeployContext);
                        expect(deployStackStub.callCount).to.equal(2);
                        expect(handlebarsSpy.called).to.be.true;
                        let params = handlebarsSpy.lastCall.args[1];

                        expect(params).to.have.property('cloudfront')
                            .which.includes({
                                minTTL: 60,
                                defaultTTL: 3600 * 2,
                                maxTTL: 3600 * 24 * 30,
                            });
                    });
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
