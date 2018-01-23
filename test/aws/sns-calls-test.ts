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
import awsWrapper from '../../src/aws/aws-wrapper';
import * as snsCalls from '../../src/aws/sns-calls';

describe('snsCalls', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('subscribeToTopic', () => {
        it('should subscribe to the topic', async () => {
            const subscriptionArn = 'FakeSubscriptionArn';
            const subscribeStub = sandbox.stub(awsWrapper.sns, 'subscribe').resolves({
                SubscriptionArn: subscriptionArn
            });

            const response = await snsCalls.subscribeToTopic('FakeTopicArn', 'lambda', 'FakeLambdaArn');
            expect(response).to.equal(subscriptionArn);
            expect(subscribeStub.callCount).to.equal(1);
        });
    });

    describe('addSnsPermission', () => {
        it('should add the permission to an existing policy doc if there is one', async () => {
            const getAttributesStub  = sandbox.stub(awsWrapper.sns, 'getTopicAttributes').resolves({
                Attributes: {
                    Policy: '{"Statement": []}'
                }
            });
            const setAttributesStub = sandbox.stub(awsWrapper.sns, 'setTopicAttributes').resolves({});

            const response = await snsCalls.addSnsPermission('FakeArn', 'FakeSourceArn', {});
            expect(response).to.deep.equal({});
            expect(getAttributesStub.callCount).to.equal(1);
            expect(setAttributesStub.callCount).to.equal(1);
        });

        it('should add a new policy doc with the permission if there isnt one yet', async () => {
            const getAttributesStub  = sandbox.stub(awsWrapper.sns, 'getTopicAttributes').resolves({
                Attributes: {}
            });
            const setAttributesStub = sandbox.stub(awsWrapper.sns, 'setTopicAttributes').resolves({});

            const response = await snsCalls.addSnsPermission('FakeArn', 'FakeSourceArn', {});
            expect(response).to.deep.equal({});
            expect(getAttributesStub.callCount).to.equal(1);
            expect(setAttributesStub.callCount).to.equal(1);
        });
    });

    describe('getSnsPermission', () => {
        const TopicArn = 'FakeTopicArn';
        const producerArn = 'FakePublisherArn';
        const permissionToGet = {
            Effect: 'Allow',
            Principal: '*',
            Action: 'sns:Publish',
            Resource: TopicArn,
            Condition: {
                ArnEquals: {
                    'aws:SourceArn': producerArn
                }
            }
        };

        it('should return the permission if present in the policy doc', async () => {
            const getAttributesStub = sandbox.stub(awsWrapper.sns, 'getTopicAttributes').resolves({
                Attributes: {
                    Policy: `{"Statement": [{"Effect": "Allow","Principal": "*","Action":"sns:Publish","Resource":"${TopicArn}","Condition":{"ArnEquals":{"aws:SourceArn": "${producerArn}"}}}]}`
                }
            });

            const returnedPermission = await snsCalls.getSnsPermission('FakeTopicArn', permissionToGet);
            expect(returnedPermission).to.deep.equal(permissionToGet);
            expect(getAttributesStub.callCount).to.equal(1);
        });

        it('should return null when the permission is not present in the policy doc', async () => {
            const getAttributesStub = sandbox.stub(awsWrapper.sns, 'getTopicAttributes').resolves({
                Attributes: {
                    Policy: `{"Statement": [{"Effect": "Allow","Principal": "*","Action":"sns:Publish","Resource":"SomeOtherArn","Condition":{"ArnEquals":{"aws:SourceArn": "${producerArn}"}}}]}`
                }
            });

            const returnedPermission = await snsCalls.getSnsPermission('FakeTopicArn', permissionToGet);
            expect(returnedPermission).to.equal(null);
            expect(getAttributesStub.callCount).to.equal(1);
        });

        it('should return null when there is no policy doc', async () => {
            const getAttributesStub  = sandbox.stub(awsWrapper.sns, 'getTopicAttributes').resolves({
                Attributes: {}
            });

            const returnedPermission = await snsCalls.getSnsPermission('FakeTopicArn', permissionToGet);
            expect(returnedPermission).to.equal(null);
            expect(getAttributesStub.callCount).to.equal(1);
        });
    });

    describe('addSnsPermissionIfNotExists', () => {
        it('should add the permission if it doesnt exist', async () => {
            const getAttributesStub = sandbox.stub(awsWrapper.sns, 'getTopicAttributes');
            const policyStatement = {
                'Effect': 'Allow',
                'Principal': '*',
                'Action': 'sns:SendMessage',
                'Resource': 'FakeTopicArn',
                'Condition': {
                    'ArnEquals': {
                        'aws:SourceArn': 'FakeSourceArn'
                    }
                }
            };
            getAttributesStub.onFirstCall().resolves({
                Attributes: {}
            });
            getAttributesStub.onSecondCall().resolves({
                Attributes: {}
            });
            getAttributesStub.onThirdCall().resolves({
                Attributes: {
                    Policy: JSON.stringify({
                        'Statement': [ policyStatement ]
                    })
                }
            });
            const setAttributesStub = sandbox.stub(awsWrapper.sns, 'setTopicAttributes').resolves({});

            const permission = await snsCalls.addSnsPermissionIfNotExists('FakeTopicArn', 'FakeSourceArn', policyStatement);
            expect(getAttributesStub.callCount).to.equal(3);
            expect(setAttributesStub.callCount).to.equal(1);
            expect(permission).to.not.equal(null);
        });

        it('should return the permission if it already exists', async () => {
            const policyStatement = {
                'Effect': 'Allow',
                'Principal': '*',
                'Action': 'sns:SendMessage',
                'Resource': 'FakeTopicArn',
                'Condition': {
                    'ArnEquals': {
                        'aws:SourceArn': 'FakeSourceArn'
                    }
                }
            };
            const getAttributesStub = sandbox.stub(awsWrapper.sns, 'getTopicAttributes').resolves({
                Attributes: {
                    Policy: JSON.stringify({
                        'Statement': [policyStatement]
                    })
                }
            });
            const permission = await snsCalls.addSnsPermissionIfNotExists('FakeTopicArn', 'FakeSourceArn', policyStatement);
            expect(getAttributesStub.callCount).to.equal(1);
            expect(permission).to.not.equal(null);
        });
    });
});
