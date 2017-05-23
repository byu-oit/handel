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
const accountConfig = require('../../lib/common/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const snsCalls = require('../../lib/aws/sns-calls');
const sinon = require('sinon');

describe('snsCalls', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
        AWS.restore('SNS');
    });

    describe('subscribeToTopic', function () {
        it('should subscribe to the topic', function () {
            let subscriptionArn = "FakeSubscriptionArn";
            AWS.mock('SNS', 'subscribe', Promise.resolve({
                SubscriptionArn: subscriptionArn
            }))

            return snsCalls.subscribeToTopic("FakeTopicArn", "lambda", "FakeLambdaArn")
                .then(response => {
                    expect(response).to.equal(subscriptionArn);
                });
        });
    });
});