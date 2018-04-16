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
import {
    AccountConfig,
    ConsumeEventsContext,
    DeployContext,
    PreDeployContext,
    ServiceContext,
    ServiceType,
    UnDeployContext
} from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as sqsCalls from '../../../src/aws/sqs-calls';
import * as deletePhasesCommon from '../../../src/common/delete-phases-common';
import * as deployPhaseCommon from '../../../src/common/deploy-phase-common';
import * as sqs from '../../../src/services/sqs';
import { SqsServiceConfig } from '../../../src/services/sqs/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('sqs deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<SqsServiceConfig>;
    let serviceParams: SqsServiceConfig;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    const serviceName = 'FakeService'; // FIXME: deadLetter versions?
    const serviceType = 'sqs';

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        serviceParams = {
            type: 'sqs',
            queue_type: 'fifo',
            content_based_deduplication: true,
            delay_seconds: 2,
            max_message_size: 262140,
            message_retention_period: 345601,
            visibility_timeout: 40,
            dead_letter_queue: {
                max_receive_count: 5,
                delay_seconds: 2,
                max_message_size: 262140,
                message_retention_period: 345601,
                visibility_timeout: 40
            }
        };
        serviceContext = new ServiceContext(appName, envName, serviceName, new ServiceType(STDLIB_PREFIX, serviceType), serviceParams, accountConfig);
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('shouldnt validate anything yet', () => {
            const errors = sqs.check(serviceContext, []);
            expect(errors).to.deep.equal([]);
        });
    });

    describe('deploy', () => {
        const queueName = 'FakeQueue';
        const queueArn = 'FakeArn';
        const queueUrl = 'FakeUrl';
        const deadLetterQueueName = 'FakeDeadLetterQueue';
        const deadLetterQueueArn = 'FakeDeadLetterArn';
        const deadLetterQueueUrl = 'FakeDeadLetterUrl';

        it('should deploy the queue', async () => {
            const ownPreDeployContext = new PreDeployContext(serviceContext);

            const deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').resolves({
                Outputs: [
                    {
                        OutputKey: 'QueueName',
                        OutputValue: queueName
                    },
                    {
                        OutputKey: 'QueueArn',
                        OutputValue: queueArn
                    },
                    {
                        OutputKey: 'QueueUrl',
                        OutputValue: queueUrl
                    },
                    {
                        OutputKey: 'DeadLetterQueueName',
                        OutputValue: deadLetterQueueName
                    },
                    {
                        OutputKey: 'DeadLetterQueueArn',
                        OutputValue: deadLetterQueueArn
                    },
                    {
                        OutputKey: 'DeadLetterQueueUrl',
                        OutputValue: deadLetterQueueUrl
                    }
                ]
            });

            const deployContext = await sqs.deploy(serviceContext, ownPreDeployContext, []);
            expect(deployStackStub.callCount).to.equal(1);

            expect(deployContext).to.be.instanceof(DeployContext);

            const envPrefix = serviceName.toUpperCase();

            // Should have exported 3 env vars
            expect(deployContext.environmentVariables).to.have.property(`${envPrefix}_QUEUE_NAME`, queueName);
            expect(deployContext.environmentVariables).to.have.property(`${envPrefix}_QUEUE_URL`, queueUrl);
            expect(deployContext.environmentVariables).to.have.property(`${envPrefix}_QUEUE_ARN`, queueArn);

            expect(deployContext.environmentVariables).to.have.property(`${envPrefix}_DEAD_LETTER_QUEUE_NAME`, deadLetterQueueName);
            expect(deployContext.environmentVariables).to.have.property(`${envPrefix}_DEAD_LETTER_QUEUE_URL`, deadLetterQueueUrl);
            expect(deployContext.environmentVariables).to.have.property(`${envPrefix}_DEAD_LETTER_QUEUE_ARN`, deadLetterQueueArn);

            // Should have exported 1 policy
            expect(deployContext.policies.length).to.equal(1); // Should have exported one policy
            expect(deployContext.policies[0].Resource[0]).to.equal(queueArn);
            expect(deployContext.policies[0].Resource[1]).to.equal(deadLetterQueueArn);
        });
    });

    describe('consumeEvents', () => {
        let deployContext: DeployContext;

        beforeEach(() => {
            deployContext = new DeployContext(serviceContext);
            deployContext.eventOutputs.queueUrl = 'FakeQueueUrl';
            deployContext.eventOutputs.queueArn = 'FakeQueueArn';
        });

        it('should consume from SNS event services', async () => {
            const producerServiceContext = new ServiceContext(appName, envName, 'ProducerService', new ServiceType(STDLIB_PREFIX, 'sns'), {type: 'sns'}, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.topicArn = 'FakeTopicArn';

            const addSqsPermissionStub = sandbox.stub(sqsCalls, 'addSqsPermissionIfNotExists').resolves({});

            const consumeEventsContext = await sqs.consumeEvents(serviceContext, deployContext, producerServiceContext, producerDeployContext);
            expect(addSqsPermissionStub.callCount).to.equal(1);
            expect(consumeEventsContext).to.be.instanceOf(ConsumeEventsContext);
        });

        it('should consume from S3 event services', async () => {
            const producerServiceContext = new ServiceContext(appName, envName, 'ProducerService', new ServiceType(STDLIB_PREFIX, 's3'), {type: 's3'}, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.bucketArn = 'FakeBucketArn';

            const addSqsPermissionStub = sandbox.stub(sqsCalls, 'addSqsPermissionIfNotExists').resolves({});

            const consumeEventsContext = await sqs.consumeEvents(serviceContext, deployContext, producerServiceContext, producerDeployContext);
            expect(addSqsPermissionStub.callCount).to.equal(1);
            expect(consumeEventsContext).to.be.instanceOf(ConsumeEventsContext);
        });

        it('should throw an error because SQS cant consume other services', async () => {
            const producerServiceContext = new ServiceContext(appName, envName, 'ProducerService', new ServiceType(STDLIB_PREFIX, 'otherService'), {type: 'otherService'}, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.otherArn = 'FakeArn';

            try {
                const consumeEventsContext = await sqs.consumeEvents(serviceContext, deployContext, producerServiceContext, producerDeployContext);
                expect(true).to.equal(false); // Should not get here
            }
            catch (err) {
                expect(err.message).to.contain('SQS - Unsupported event producer type given');
            }
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await sqs.unDeploy(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
