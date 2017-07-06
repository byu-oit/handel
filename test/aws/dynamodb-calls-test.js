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
const dynamodbCalls = require('../../lib/aws/dynamodb-calls');
const sinon = require('sinon');

describe('dynamodbCalls', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
        AWS.restore('DynamoDB');
    });

    describe('tagTable', function () {
        it('should tag the dynamo table', function () {
            AWS.mock('DynamoDB', 'tagResource', Promise.resolve({}))
            return dynamodbCalls.tagTable('FakeARN', {'name': 'FakeNameTag'})
                .then(response => {
                    expect(response).to.deep.equal({});
                });
        });
    });
});