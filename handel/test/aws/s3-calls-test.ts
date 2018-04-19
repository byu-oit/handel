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
import * as childProcess from 'child_process';
import 'mocha';
import * as sinon from 'sinon';
import awsWrapper from '../../src/aws/aws-wrapper';
import * as s3Calls from '../../src/aws/s3-calls';

describe('s3Calls', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('configureBucketNotifications', () => {
        const servicesToTest = [
            'lambda',
            'sns',
            'sqs'
        ];
        servicesToTest.forEach(serviceToTest => {
            it(`should configure bucket notifications for the ${serviceToTest} type`, async () => {
                const bucketName = 'FakeS3BucketName';
                const notificationArn = 'FakeNotificationArn';
                const notificationEvents: AWS.S3.EventList = [
                    's3:ObjectCreated*'
                ];
                const eventFilters: AWS.S3.FilterRuleList = [
                    {
                        Name: 'suffix',
                        Value: '.xml'
                    }
                ];
                const putNotificationStub = sandbox.stub(awsWrapper.s3, 'putBucketNotificationConfiguration').resolves({});

                await s3Calls.configureBucketNotifications(bucketName, serviceToTest, notificationArn, notificationEvents, eventFilters);
                expect(putNotificationStub.callCount).to.equal(1);
            });
        });

        it('should throw an error for other service types', async () => {
            const bucketName = 'FakeS3BucketName';
            const notificationType = 'othertype';
            const notificationArn = 'FakeNotificationArn';
            const notificationEvents: AWS.S3.EventList = [
                's3:ObjectCreated*'
            ];
            const eventFilters: AWS.S3.FilterRuleList = [
                {
                    Name: 'suffix',
                    Value: '.xml'
                }
            ];

            try {
                await s3Calls.configureBucketNotifications(bucketName, notificationType, notificationArn, notificationEvents, eventFilters);
                expect(true).to.equal(false);
            }
            catch(err) {
                expect(err.message).to.contain('unsupported notification type');
            }
        });
    });
});
