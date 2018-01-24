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
import * as SES from 'aws-sdk/clients/ses';
import * as winston from 'winston';
import awsWrapper from './aws-wrapper';

export async function verifyEmailAddress(address: string) {
    const ses = new SES({ apiVersion: '2010-12-01' });
    winston.verbose(`Verifying ${address} if needed`);

    const response = await awsWrapper.ses.getIdentityVerificationAttributes({ Identities: [address] });
    const addressVerified: boolean = address in response.VerificationAttributes
        && response.VerificationAttributes[address].VerificationStatus !== 'Failed';
    if (!addressVerified) {
        winston.verbose(`Requested verification for ${address}`);
        return awsWrapper.ses.verifyEmailAddress({ EmailAddress: address });
    }
    winston.verbose(`${address} is already verified`);
}
