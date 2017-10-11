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
const AWS = require('aws-sdk');
const winston = require('winston');

function verifyEmailAddress(address) {
    const ses = new AWS.SES({apiVersion: '2010-12-01'});
    winston.verbose(`Verifying ${address} if needed`);
    return ses.getIdentityVerificationAttributes({Identities: [address]}).promise()
        .then(response => {
            const address_verified = address in response.VerificationAttributes
                && response.VerificationAttributes[address].VerificationStatus != 'Failed';
            if (!address_verified) {
                winston.verbose(`Requested verification for ${address}`);
                return ses.verifyEmailAddress({EmailAddress: address}).promise();
            }
            winston.verbose(`${address} is already verified`);
        });
}

exports.verifyEmailAddress = verifyEmailAddress;