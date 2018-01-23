/*
 * Copyright 2018 Brigham Young University
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
import { expect } from 'chai';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as route53calls from '../../../src/aws/route53-calls';
import * as s3Calls from '../../../src/aws/s3-calls';
import * as deletePhasesCommon from '../../../src/common/delete-phases-common';
import * as deployPhaseCommon from '../../../src/common/deploy-phase-common';
import * as handlebarsUtils from '../../../src/common/handlebars-utils';
import * as s3DeployersCommon from '../../../src/common/s3-deployers-common';
import { AccountConfig, DeployContext, PreDeployContext, ServiceContext, UnDeployContext } from '../../../src/datatypes';
import * as s3StaticSite from '../../../src/services/s3staticsite';
import { S3StaticSiteServiceConfig } from '../../../src/services/s3staticsite/config-types';

describe('s3staticsite deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let ownServiceContext: ServiceContext<S3StaticSiteServiceConfig>;
    let serviceParams: S3StaticSiteServiceConfig;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        serviceParams = {
            type: 's3staticsite',
            path_to_code: '.',
        };
        ownServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 's3staticsite', serviceParams, accountConfig);
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should require the path_to_code parameter', () => {
            delete ownServiceContext.params.path_to_code;
            const errors = s3StaticSite.check(ownServiceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'path_to_code\' parameter is required');
        });

        it('should work when all required parameters are given', () => {
            const errors = s3StaticSite.check(ownServiceContext, []);
            expect(errors.length).to.equal(0);
        });

        describe('versioning', () => {
            const valid = ['enabled', 'disabled'];
            for (const validValue of valid) {
                it(`should allow '${validValue}'`, () => {
                    ownServiceContext.params.versioning = validValue;

                    const errors = s3StaticSite.check(ownServiceContext, []);
                    expect(errors.length).to.equal(0);
                });
            }
            it('should reject invalid values', () => {
                ownServiceContext.params.versioning = 'off';
                const errors = s3StaticSite.check(ownServiceContext, []);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include('\'versioning\' parameter must be either \'enabled\' or \'disabled\'');
            });
        });
        describe('cloudfront.logging', () => {
            const valid = ['enabled', 'disabled'];
            for (const validValue of valid) {
                it(`should allow '${validValue}'`, () => {
                    ownServiceContext.params.cloudfront = { logging: validValue };

                    const errors = s3StaticSite.check(ownServiceContext, []);
                    expect(errors.length).to.equal(0);
                });
            }
            it('should reject invalid values', () => {
                ownServiceContext.params.cloudfront = { logging: 'off' };
                const errors = s3StaticSite.check(ownServiceContext, []);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include('\'logging\' parameter must be either \'enabled\' or \'disabled\'');
            });
        });
        describe('cloudfront.price_class', () => {
            const valid = ['100', '200', 'all'];
            for (const validValue of valid) {
                it(`should allow '${validValue}'`, () => {
                    ownServiceContext.params.cloudfront = { price_class: validValue };

                    const errors = s3StaticSite.check(ownServiceContext, []);
                    expect(errors.length).to.equal(0);
                });
            }
            it('should reject invalid values', () => {
                ownServiceContext.params.cloudfront = { price_class: 'off' };
                const errors = s3StaticSite.check(ownServiceContext, []);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include('\'price_class\' parameter must be one of \'100\', \'200\', or \'all\'');
            });
        });
        describe('cloudfront TTLs', () => {
            const ttlFields = ['min', 'max', 'default'];
            const aliases = ['second', 'minute', 'hour', 'day', 'year'];
            for (const field of ttlFields.map(it => `${it}_ttl`)) {
                it(`should allow numbers in '${field}`, () => {
                    ownServiceContext.params.cloudfront = { [field]: 100 };
                    const errors = s3StaticSite.check(ownServiceContext, []);
                    expect(errors.length).to.equal(0);
                });
                for (const alias of aliases) {
                    it(`should allow ${alias} aliases in '${field}`, () => {
                        ownServiceContext.params.cloudfront = { [field]: `2 ${alias}` };
                        let errors = s3StaticSite.check(ownServiceContext, []);
                        expect(errors.length).to.equal(0);

                        // plural
                        ownServiceContext.params.cloudfront = { [field]: `2 ${alias}s` };
                        errors = s3StaticSite.check(ownServiceContext, []);
                        expect(errors.length).to.equal(0);
                    });
                }
                it(`should reject invalid values in '${field}`, () => {
                    ownServiceContext.params.cloudfront = { [field]: 'foobar' };

                    const errors = s3StaticSite.check(ownServiceContext, []);
                    expect(errors).to.have.lengthOf(1);
                    expect(errors[0]).to.include(`'${field}' parameter must be a valid TTL value`);
                });
            }
        });
        describe('cloudfront.dns_name', () => {
            it('should allow valid hostnames', () => {
                ownServiceContext.params.cloudfront = { dns_names: ['valid.dns.name.com'] };

                const errors = s3StaticSite.check(ownServiceContext, []);
                expect(errors.length).to.equal(0);
            });
            it('should reject invalid values', () => {
                ownServiceContext.params.cloudfront = { dns_names: ['invalid hostname', 'valid.dns.name.com'] };

                const errors = s3StaticSite.check(ownServiceContext, []);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.include('\'dns_name\' parameter must be a valid DNS hostname');
            });
        });
    });

    describe('deploy', () => {
        let ownPreDeployContext: PreDeployContext;
        let handlebarsSpy: sinon.SinonSpy;

        beforeEach(() => {
            ownPreDeployContext = new PreDeployContext(ownServiceContext);
            handlebarsSpy = sandbox.spy(handlebarsUtils, 'compileTemplate');
        });

        it('should deploy the static site bucket', async () => {
            const createLoggingBucketStub = sandbox.stub(s3DeployersCommon, 'createLoggingBucketIfNotExists').resolves('FakeBucket');
            const deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack');
            deployStackStub.onCall(0).resolves({
                Outputs: [{
                    OutputKey: 'BucketName',
                    OutputValue: 'logging-bucket'
                }]
            });
            deployStackStub.onCall(1).resolves({
                Outputs: [{
                    OutputKey: 'BucketName',
                    OutputValue: 'my-static-site-bucket'
                }]
            });
            const uploadDirectoryStub = sandbox.stub(s3Calls, 'uploadDirectory').resolves({});

            const deployContext = await s3StaticSite.deploy(ownServiceContext, ownPreDeployContext, []);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(createLoggingBucketStub.callCount).to.equal(1);
            expect(deployStackStub.callCount).to.equal(1);
            expect(uploadDirectoryStub.callCount).to.equal(1);
            expect(handlebarsSpy.callCount).to.equal(1);

            const params = handlebarsSpy.lastCall.args[1];

            expect(params.cloudfront).to.equal(undefined);
        });

        describe('cloudfront', () => {
            let listHostedZonesStub: sinon.SinonStub;
            let deployStackStub: sinon.SinonStub;
            let createLoggingBucketStub: sinon.SinonStub;

            beforeEach(() => {
                ownServiceContext.params.cloudfront = {};
                listHostedZonesStub = sandbox.stub(route53calls, 'listHostedZones').resolves([]);

                createLoggingBucketStub = sandbox.stub(s3DeployersCommon, 'createLoggingBucketIfNotExists').resolves('FakeBucket');

                deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack');
                deployStackStub.onCall(0).resolves({
                    Outputs: [{
                        OutputKey: 'BucketName',
                        OutputValue: 'logging-bucket'
                    }]
                });
                deployStackStub.onCall(1).resolves({
                    Outputs: [{
                        OutputKey: 'BucketName',
                        OutputValue: 'my-static-site-bucket'
                    }]
                });
                sandbox.stub(s3Calls, 'uploadDirectory').resolves({});
            });

            it('should deploy cloudfront with default parameters', async () => {
                const deployContext = await s3StaticSite.deploy(ownServiceContext, ownPreDeployContext, []);
                expect(deployContext).to.be.instanceof(DeployContext);
                expect(createLoggingBucketStub.callCount).to.equal(1);
                expect(deployStackStub.callCount).to.equal(1);
                expect(handlebarsSpy.callCount).to.equal(1);
                const params = handlebarsSpy.lastCall.args[1];

                expect(params).to.have.property('cloudfront')
                    .that.includes({
                        logging: true,
                        minTTL: 0,
                        maxTTL: 31536000,
                        defaultTTL: 86400,
                        priceClass: 'PriceClass_All'
                    }).and.has.property('setIPV6FunctionBody');
            });

            it('should allow DNS names to be set', async () => {
                ownServiceContext.params.cloudfront!.dns_names = ['test.dns.com'];

                listHostedZonesStub.resolves([{
                    Name: 'dns.com.',
                    Id: 'dnscom'
                }]);

                const deployContext = await s3StaticSite.deploy(ownServiceContext, ownPreDeployContext, []);
                expect(deployContext).to.be.instanceof(DeployContext);
                expect(createLoggingBucketStub.callCount).to.equal(1);
                expect(deployStackStub.callCount).to.equal(1);
                expect(handlebarsSpy.callCount).to.equal(1);
            });

            it('should allow an HTTPS cert to be configured', async () => {
                ownServiceContext.params.cloudfront!.https_certificate = 'abc123';

                const deployContext = await s3StaticSite.deploy(ownServiceContext, ownPreDeployContext, []);
                expect(deployContext).to.be.instanceof(DeployContext);
                expect(createLoggingBucketStub.callCount).to.equal(1);
                expect(deployStackStub.callCount).to.equal(1);
                expect(handlebarsSpy.callCount).to.equal(1);
                const params = handlebarsSpy.lastCall.args[1];

                expect(params).to.have.property('cloudfront')
                    .which.has.property('httpsCertificateId', 'abc123');
            });

            it('should allow cloudfront logging to be disabled', async () => {
                ownServiceContext.params.cloudfront!.logging = 'disabled';

                const deployContext = await s3StaticSite.deploy(ownServiceContext, ownPreDeployContext, []);
                expect(deployContext).to.be.instanceof(DeployContext);
                expect(createLoggingBucketStub.callCount).to.equal(1);
                expect(deployStackStub.callCount).to.equal(1);
                expect(handlebarsSpy.callCount).to.equal(1);
                const params = handlebarsSpy.lastCall.args[1];

                expect(params).to.have.property('cloudfront')
                    .which.has.property('logging', false);
            });

            it('should allow cloudfront TTLs to be customized', async () => {
                const cf = ownServiceContext.params.cloudfront!;
                cf.min_ttl = '1 minute';
                cf.default_ttl = '2 hours';
                cf.max_ttl = '30days';

                const deployContext = await s3StaticSite.deploy(ownServiceContext, ownPreDeployContext, []);
                expect(deployContext).to.be.instanceof(DeployContext);
                expect(createLoggingBucketStub.callCount).to.equal(1);
                expect(deployStackStub.callCount).to.equal(1);
                expect(handlebarsSpy.callCount).to.equal(1);
                const params = handlebarsSpy.lastCall.args[1];

                expect(params).to.have.property('cloudfront')
                    .which.includes({
                        minTTL: 60,
                        defaultTTL: 3600 * 2,
                        maxTTL: 3600 * 24 * 30,
                    });
            });
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').resolves(new UnDeployContext(ownServiceContext));

            const unDeployContext = await s3StaticSite.unDeploy(ownServiceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
