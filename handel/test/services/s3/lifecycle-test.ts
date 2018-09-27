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
import { AccountConfig, ServiceContext, ServiceType } from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import { S3ServiceConfig } from '../../../src/services/s3/config-types';
import * as s3Lifecycle from '../../../src/services/s3/lifecycles';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('s3 lifecycle helper', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;
    let serviceContext: ServiceContext<S3ServiceConfig>;
    let serviceParams: S3ServiceConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        serviceParams = {
            type: 's3',
            bucket_name: 'somename',
            bucket_acl: 'PublicRead',
            lifecycles: [
                {
                    name: 'lifecyclename',
                    transitions: [
                        {
                            type: 'ia',
                            days: 30
                        }
                    ]
                }
            ]
        };
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 's3'), serviceParams, accountConfig);
        sandbox = sinon.sandbox.create();

    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('checkLifecycles', () => {

        it('should require versioning enabled for version transitions', () => {
            serviceContext.params = {
                type: 's3',
                bucket_name: 'somename',
                bucket_acl: 'PublicRead',
                versioning: 'disabled',
                lifecycles: [
                    {
                        name: 'FakeName',
                        version_transitions:
                            [
                                {
                                    type: 'ia',
                                    days: 30
                                }
                            ]
                    }
                ]
            };
            const errors: string[] = [];
            s3Lifecycle.checkLifecycles(serviceContext, errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('You must enable versioning to have version transition rules');
        });

        it('should be valid type', () => {
            serviceContext.params.lifecycles![0].transitions![0].type = 'standard';
            const errors: string[] = [];
            s3Lifecycle.checkLifecycles(serviceContext, errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('You must specify transition type of');
        });

        it('should be greater that 30 days if ia type', () => {
            serviceContext.params.lifecycles![0].transitions![0].days = 7;
            const errors: string[] = [];
            s3Lifecycle.checkLifecycles(serviceContext, errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('Infrequent access has a minimum age of 30 days');
        });

        it('should be consistent days vs dates', () => {
            serviceContext.params = {
                type: 's3',
                bucket_name: 'somename',
                bucket_acl: 'PublicRead',
                versioning: 'disabled',
                lifecycles: [
                    {
                        name: 'FakeName',
                        transitions:
                            [
                                {
                                    type: 'ia',
                                    days: 30
                                },
                                {
                                    type: 'glacier',
                                    date: 'somedate'
                                }
                            ]
                    }
                ]
            };
            const errors: string[] = [];
            s3Lifecycle.checkLifecycles(serviceContext, errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('You must specify only either days or dates in transitions rules');
        });

        it('should be include day or dates', () => {
            serviceContext.params = {
                type: 's3',
                bucket_name: 'somename',
                bucket_acl: 'PublicRead',
                versioning: 'disabled',
                lifecycles: [
                    {
                        name: 'FakeName',
                        transitions:
                            [
                                {
                                    type: 'ia'
                                }
                            ]
                    }
                ]
            };
            const errors: string[] = [];
            s3Lifecycle.checkLifecycles(serviceContext, errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('You must specify one of either days or dates in transitions rules');
        });

        it('should be only days in version transitions', () => {
            serviceContext.params = {
                type: 's3',
                bucket_name: 'somename',
                bucket_acl: 'PublicRead',
                versioning: 'enabled',
                lifecycles: [
                    {
                        name: 'FakeName',
                        version_transitions:
                            [
                                {
                                    type: 'ia',
                                    date: 'fakeDate'
                                }
                            ]
                    }
                ]
            };
            const errors: string[] = [];
            s3Lifecycle.checkLifecycles(serviceContext, errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('You must specify only days in version transitions rules');
        });
    });

    describe('getLifecycleConfig', () => {
        it('should return lifecycle config with days', () => {
            serviceContext.params = {
                type: 's3',
                bucket_name: 'somename',
                bucket_acl: 'PublicRead',
                versioning: 'enabled',
                lifecycles: [
                    {
                        name: 'FakeName',
                        transitions:
                            [
                                {
                                    type: 'ia',
                                    days: 30
                                },
                                {
                                    type: 'glacier',
                                    days: 90
                                },
                                {
                                    type: 'expiration',
                                    days: 365
                                }
                            ],
                        version_transitions:
                            [
                                {
                                    type: 'ia',
                                    days: 30
                                },
                                {
                                    type: 'expiration',
                                    days: 365
                                }
                            ]
                    }
                ]
            };
            const results = s3Lifecycle.getLifecycleConfig(serviceContext)!;
            expect(results.length).to.equal(1);
            expect(results[0].name).to.equal('FakeName');
            expect(results[0].transitions!.length).to.equal(2);
            expect(results[0].expiration_days).to.equal(365);
            expect(results[0].noncurrent_version_transitions!.length).to.equal(1);
            expect(results[0].noncurrent_version_expiration_days).to.equal(365);
        });

        it('should return lifecycle config with date', () => {
            serviceContext.params = {
                type: 's3',
                bucket_name: 'somename',
                bucket_acl: 'PublicRead',
                versioning: 'enabled',
                lifecycles: [
                    {
                        name: 'FakeName',
                        transitions:
                            [
                                {
                                    type: 'ia',
                                    date: 'FakeDate'
                                },
                                {
                                    type: 'glacier',
                                    date: 'FakeDate'
                                },
                                {
                                    type: 'expiration',
                                    date: 'FakeDate'
                                }
                            ]
                    }
                ]
            };
            const results = s3Lifecycle.getLifecycleConfig(serviceContext)!;
            expect(results.length).to.equal(1);
            expect(results[0].name).to.equal('FakeName');
            expect(results[0].transitions!.length).to.equal(2);
            expect(results[0].expiration_date).to.equal('FakeDate');
        });
    });
});
