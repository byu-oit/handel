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
import { expect } from 'chai';
import * as sinon from 'sinon';
import awsWrapper from '../../src/aws/aws-wrapper';
import * as sesCalls from '../../src/aws/ses-calls';

describe('sesCalls', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('verifyEmailAddress', () => {
        const FAKE_ADDRESS = 'user@example.com';
        const GARBAGE = 'garbage';

        it('should not verify email address if already verified', async () => {
            const getIdentityStub = sandbox.stub(awsWrapper.ses, 'getIdentityVerificationAttributes')
            .returns(Promise.resolve({
                VerificationAttributes: {
                    [FAKE_ADDRESS]: {
                        VerificationStatus: 'Success'
                    }
                }
            }));
            const verifyEmailAddressStub = sandbox.stub(awsWrapper.ses, 'verifyEmailAddress')
                .returns(Promise.resolve(GARBAGE));
            const response = await sesCalls.verifyEmailAddress(FAKE_ADDRESS);
            expect(getIdentityStub.callCount).to.equal(1);
            expect(verifyEmailAddressStub.callCount).to.equal(0);
            expect(response).to.not.equal(GARBAGE);
        });

        it('should verify unverified email addresses', async () => {
            const getIdentityStub = sandbox.stub(awsWrapper.ses, 'getIdentityVerificationAttributes')
            .returns(Promise.resolve({
                VerificationAttributes: {}
            }));
            const verifyEmailAddressStub = sandbox.stub(awsWrapper.ses, 'verifyEmailAddress')
                .returns(Promise.resolve(GARBAGE));
            const response = await sesCalls.verifyEmailAddress(FAKE_ADDRESS);
            expect(getIdentityStub.callCount).to.equal(1);
            expect(verifyEmailAddressStub.callCount).to.equal(1);
            expect(response).to.equal(GARBAGE);
        });

        it('should retry failed verification', async () => {
            const getIdentityStub = sandbox.stub(awsWrapper.ses, 'getIdentityVerificationAttributes')
            .returns(Promise.resolve({
                VerificationAttributes: {
                    [FAKE_ADDRESS]: {
                        VerificationStatus: 'Failed'
                    }
                }
            }));
            const verifyEmailAddressStub = sandbox.stub(awsWrapper.ses, 'verifyEmailAddress')
                .returns(Promise.resolve(GARBAGE));
            const response = await sesCalls.verifyEmailAddress(FAKE_ADDRESS);
            expect(getIdentityStub.callCount).to.equal(1);
            expect(verifyEmailAddressStub.callCount).to.equal(1);
            expect(response).to.equal(GARBAGE);
        });
    });
});
