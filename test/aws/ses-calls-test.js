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
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const sesCalls = require('../../lib/aws/ses-calls');
const sinon = require('sinon');

describe('sesCalls', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
        AWS.restore('SES');
    });

    describe('verifyEmailAddress', function () {
        const FAKE_ADDRESS = 'user@example.com';
        const GARBAGE = 'garbage';

        it('should not verify email address if already verified', function () {

            AWS.mock('SES', 'getIdentityVerificationAttributes', {
                VerificationAttributes: {
                    [FAKE_ADDRESS]: {
                        VerificationStatus: "Success"
                    }
                }
            });
            AWS.mock('SES', 'verifyEmailAddress', GARBAGE);
            sesCalls.verifyEmailAddress(FAKE_ADDRESS).then(response => {
                expect(response).to.not.equal(GARBAGE);
            });
        });

        it('should verify unverified email addresses', function () {
            
            AWS.mock('SES', 'getIdentityVerificationAttributes', {
                VerificationAttributes: {}
            });
            AWS.mock('SES', 'verifyEmailAddress', GARBAGE);
            sesCalls.verifyEmailAddress(FAKE_ADDRESS).then(response => {
                expect(response).to.equal(GARBAGE);
            });
        });

        it('should retry failed verification', function () {

            AWS.mock('SES', 'getIdentityVerificationAttributes', {
                VerificationAttributes: {
                    [FAKE_ADDRESS]: {
                        VerificationStatus: 'Failed'
                    }
                }
            });
            AWS.mock('SES', 'verifyEmailAddress', GARBAGE);
            sesCalls.verifyEmailAddress(FAKE_ADDRESS).then(response => {
                expect(response).to.equal(GARBAGE);
            });
        });
    });
});