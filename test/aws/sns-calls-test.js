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
const snsCalls = require('../../dist/aws/sns-calls');
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

    describe('addSnsPermission', function () {
        it('should add the permission to an existing policy doc if there is one', function () {
            AWS.mock('SNS', 'getTopicAttributes', Promise.resolve({
                Attributes: {
                    Policy: '{"Statement": []}'
                }
            }));

            AWS.mock('SNS', 'setTopicAttributes', Promise.resolve({}));

            return snsCalls.addSnsPermission("FakeArn", "FakeSourceArn", {})
                .then(response => {
                    expect(response).to.deep.equal({});
                });
        });

        it('should add a new policy doc with the permission if there isnt one yet', function () {
            AWS.mock('SNS', 'getTopicAttributes', Promise.resolve({
                Attributes: {}
            }));

            AWS.mock('SNS', 'setTopicAttributes', Promise.resolve({}));

            return snsCalls.addSnsPermission("FakeArn", "FakeSourceArn", {})
                .then(response => {
                    expect(response).to.deep.equal({});
                });
        });
    });

    describe('getSnsPermission', function () {
        let TopicArn = "FakeTopicArn";
        let producerArn = "FakePublisherArn";
        let permissionToGet = {
            Effect: "Allow",
            Principal: "*",
            Action: "sns:Publish",
            Resource: TopicArn,
            Condition: {
                ArnEquals: {
                    "aws:SourceArn": producerArn
                }
            }
        }

        it('should return the permission if present in the policy doc', function () {
            AWS.mock('SNS', 'getTopicAttributes', Promise.resolve({
                Attributes: {
                    Policy: `{"Statement": [{"Effect": "Allow","Principal": "*","Action":"sns:Publish","Resource":"${TopicArn}","Condition":{"ArnEquals":{"aws:SourceArn": "${producerArn}"}}}]}`
                }
            }));

            return snsCalls.getSnsPermission("FakeTopicArn", permissionToGet)
                .then(returnedPermission => {
                    expect(returnedPermission).to.deep.equal(permissionToGet);
                });
        });

        it('should return null when the permission is not present in the policy doc', function () {
            AWS.mock('SNS', 'getTopicAttributes', Promise.resolve({
                Attributes: {
                    Policy: `{"Statement": [{"Effect": "Allow","Principal": "*","Action":"sns:Publish","Resource":"SomeOtherArn","Condition":{"ArnEquals":{"aws:SourceArn": "${producerArn}"}}}]}`
                }
            }));

            return snsCalls.getSnsPermission("FakeTopicArn", permissionToGet)
                .then(returnedPermission => {
                    expect(returnedPermission).to.equal(null);
                });
        });

        it('should return null when there is no policy doc', function () {
            AWS.mock('SNS', 'getTopicAttributes', Promise.resolve({
                Attributes: {}
            }));

            return snsCalls.getSnsPermission("FakeTopicArn", permissionToGet)
                .then(returnedPermission => {
                    expect(returnedPermission).to.equal(null);
                });
        });
    });

    describe('addSnsPermissionIfNotExists', function () {
        it('should add the permission if it doesnt exist', function () {
            let getSnsPermissionStub = sandbox.stub(snsCalls, 'getSnsPermission');
            getSnsPermissionStub.onFirstCall().returns(Promise.resolve(null));
            getSnsPermissionStub.onSecondCall().returns(Promise.resolve({}));
            let addSnsPermissionStub = sandbox.stub(snsCalls, 'addSnsPermission').returns(Promise.resolve({}));

            return snsCalls.addSnsPermissionIfNotExists("FakeTopicArn", "FakeSourceArn", {})
                .then(permission => {
                    expect(getSnsPermissionStub.callCount).to.equal(2);
                    expect(addSnsPermissionStub.callCount).to.equal(1);
                    expect(permission).to.deep.equal({});
                });
        });

        it('should return the permission if it already exists', function () {
            let getSnsPermissionStub = sandbox.stub(snsCalls, 'getSnsPermission').returns(Promise.resolve({}));
            let addSnsPermissionStub = sandbox.stub(snsCalls, 'addSnsPermission').returns(Promise.resolve({}));

            return snsCalls.addSnsPermissionIfNotExists("FakeTopicArn", "FakeSourceArn", {})
                .then(permission => {
                    expect(getSnsPermissionStub.callCount).to.equal(1);
                    expect(addSnsPermissionStub.callCount).to.equal(0);
                    expect(permission).to.deep.equal({});
                });
        });
    });
});