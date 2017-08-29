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
const s3Lifecycle = require('../../../lib/services/s3/lifecycles');
const sinon = require('sinon');
const expect = require('chai').expect;

const accountConfig = require('../../../lib/common/account-config')(`${__dirname}/../../test-account-config.yml`);

describe('s3 lifecycle helper', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('checkLifecycles', function () {
        it('should require a name if specified lifecycles', function () {
            let serviceContext = {
                params: {
                    bucket_name: 'somename',
                    bucket_acl: 'PublicRead',
                    lifecycles: [
                        { transitions: [{ type: 'ia', days: '30' }] }
                    ]
                }
            }
            let errors = [];
            s3Lifecycle.checkLifecycles(serviceContext, "FakeService", errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("You must specify name in the 'lifecycles' section");
        });

        it('should require at least one transition', function () {
            let serviceContext = {
                params: {
                    bucket_name: 'somename',
                    bucket_acl: 'PublicRead',
                    lifecycles: [
                        {
                            name: 'FakeName',
                        }
                    ]
                }
            }
            let errors = []
            s3Lifecycle.checkLifecycles(serviceContext, "FakeService", errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("You must specify at least one transition or version transition in the 'lifecycles' section");
        });

        it('should require versioning enabled for version transitions', function () {
            let serviceContext = {
                params: {
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
                }
            }
            let errors = []
            s3Lifecycle.checkLifecycles(serviceContext, "FakeService", errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("You must enable versioning to have version transition rules");
        });

        it('should be valid type', function () {
            let serviceContext = {
                params: {
                    bucket_name: 'somename',
                    bucket_acl: 'PublicRead',
                    versioning: 'disabled',
                    lifecycles: [
                        {
                            name: 'FakeName',
                            transitions:
                            [
                                {
                                    type: 'standard',
                                    days: 30
                                }
                            ]
                        }
                    ]
                }
            }
            let errors = []
            s3Lifecycle.checkLifecycles(serviceContext, "FakeService", errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("You must specify transition type of");
        });

        it('should be greater that 30 days if ia type', function () {
            let serviceContext = {
                params: {
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
                                    days: 7
                                }
                            ]
                        }
                    ]
                }
            }
            let errors = []
            s3Lifecycle.checkLifecycles(serviceContext, "FakeService", errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("Infrequent access has a minimum age of 30 days");
        });

        it('should be consistent days vs dates', function () {
            let serviceContext = {
                params: {
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
                                    date: 365
                                }
                            ]
                        }
                    ]
                }
            }
            let errors = []
            s3Lifecycle.checkLifecycles(serviceContext, "FakeService", errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("You must specify only either days or dates in transitions rules");
        });

        it('should be include day or dates', function () {
            let serviceContext = {
                params: {
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
                }
            }
            let errors = []
            s3Lifecycle.checkLifecycles(serviceContext, "FakeService", errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("You must specify one of either days or dates in transitions rules");
        });

        it('should be only days in version transitions', function () {
            let serviceContext = {
                params: {
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
                }
            }
            let errors = []
            s3Lifecycle.checkLifecycles(serviceContext, "FakeService", errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("You must specify only days in version transitions rules");
        });
    });

    describe('getLifecycleConfig', function () {
        it('should return lifecycle config with days', function () {
            let serviceContext = {
                params: {
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
                }
            }
            let results = s3Lifecycle.getLifecycleConfig(serviceContext);
            expect(results.length).to.equal(1);
            expect(results[0].name).to.equal('FakeName');
            expect(results[0].transitions.length).to.equal(2);
            expect(results[0].expiration_days).to.equal(365);
            expect(results[0].noncurrent_version_transitions.length).to.equal(1);
            expect(results[0].noncurrent_version_expiration_days).to.equal(365);
        });

        it('should return lifecycle config with date', function () {
            let serviceContext = {
                params: {
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
                }
            }
            let results = s3Lifecycle.getLifecycleConfig(serviceContext);
            expect(results.length).to.equal(1);
            expect(results[0].name).to.equal('FakeName');
            expect(results[0].transitions.length).to.equal(2);
            expect(results[0].expiration_date).to.equal('FakeDate');
        });
    });
});