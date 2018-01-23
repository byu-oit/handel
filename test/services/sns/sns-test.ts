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
import config from '../../../src/account-config/account-config';
import * as snsCalls from '../../../src/aws/sns-calls';
import * as deletePhasesCommon from '../../../src/common/delete-phases-common';
import * as deployPhaseCommon from '../../../src/common/deploy-phase-common';
import { AccountConfig, ConsumeEventsContext, DeployContext, PreDeployContext, ProduceEventsContext, ServiceContext, UnDeployContext } from '../../../src/datatypes';
import * as sns from '../../../src/services/sns';
import { SnsServiceConfig } from '../../../src/services/sns/config-types';

describe('sns deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<SnsServiceConfig>;
    let serviceParams: SnsServiceConfig;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    const serviceName = 'FakeService';
    const serviceType = 'sns';

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        serviceParams = {
            type: serviceType,
            subscriptions: [{
                protocol: 'http',
                endpoint: 'fakeendpoint'
            }]
        };
        serviceContext = new ServiceContext(appName, envName, serviceName, serviceType, serviceParams, accountConfig);
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should handle no subscriptions', () => {
            const errors = sns.check(serviceContext, []);
            expect(errors).to.deep.equal([]);
        });
        it('should require an endpoint on a subscription', () => {
            delete serviceContext.params.subscriptions![0].endpoint;
            const errors = sns.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`requires an 'endpoint'`);
        });
        it('should require a protocol on a subscription', () => {
            delete serviceContext.params.subscriptions![0].protocol;
            const errors = sns.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`requires a 'protocol'`);
        });
        it('should require a valid protocol', () => {
            serviceContext.params.subscriptions![0].protocol = 'webhook';
            const errors = sns.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`Protocol must be one of`);
        });
    });

    describe('deploy', () => {
        const topicName = 'FakeTopic';
        const topicArn = 'FakeArn';

        it('should deploy the topic', async () => {
            const ownPreDeployContext = new PreDeployContext(serviceContext);
            const deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [
                    {
                        OutputKey: 'TopicName',
                        OutputValue: topicName
                    },
                    {
                        OutputKey: 'TopicArn',
                        OutputValue: topicArn
                    }
                ]
            }));

            const deployContext = await sns.deploy(serviceContext, ownPreDeployContext, []);
            expect(deployStackStub.callCount).to.equal(1);
            expect(deployContext).to.be.instanceof(DeployContext);

            const envPrefix = serviceName.toUpperCase();

            // Should have exported 2 env vars
            expect(deployContext.environmentVariables).to.have.property(`${envPrefix}_TOPIC_NAME`, topicName);
            expect(deployContext.environmentVariables).to.have.property(`${envPrefix}_TOPIC_ARN`, topicArn);

            // Should have exported 1 policy
            expect(deployContext.policies.length).to.equal(1); // Should have exported one policy
            expect(deployContext.policies[0].Resource[0]).to.equal(topicArn);
        });
    });

    describe('produceEvents', () => {
        it('should subscribe the service to the topic when a lambda is given', async () => {
            const ownDeployContext = new DeployContext(serviceContext);
            ownDeployContext.eventOutputs.topicArn = 'FakeTopicArn';

            const consumerServiceContext = new ServiceContext(appName, envName, 'consumerService', 'lambda', { type: 'lambda' }, accountConfig);
            const consumerDeployContext = new DeployContext(consumerServiceContext);
            consumerDeployContext.eventOutputs.lambdaArn = 'FakeLambdaArn';

            const subscribeToTopicStub = sandbox.stub(snsCalls, 'subscribeToTopic').resolves({});

            const produceEventsContext = await sns.produceEvents(serviceContext, ownDeployContext, consumerServiceContext, consumerDeployContext);
            expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
            expect(subscribeToTopicStub.callCount).to.equal(1);
        });

        it('should return an error for any other service type', async () => {
            const ownDeployContext = new DeployContext(serviceContext);
            ownDeployContext.eventOutputs.topicArn = 'FakeTopicArn';

            const consumerServiceContext = new ServiceContext(appName, envName, 'consumerService', 'efs', { type: 'efs' }, accountConfig);
            const consumerDeployContext = new DeployContext(consumerServiceContext);

            const subscribeToTopicStub = sandbox.stub(snsCalls, 'subscribeToTopic').resolves({});

            try {
                const produceEventsContext = await sns.produceEvents(serviceContext, ownDeployContext, consumerServiceContext, consumerDeployContext);
                expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
                expect(true).to.equal(false);
            }
            catch (err) {
                expect(err.message).to.contain('Unsupported event consumer type given');
                expect(subscribeToTopicStub.callCount).to.equal(0);
            }
        });
    });

    describe('consumeEvents', () => {
        it('should consume cloud watch event service', async () => {
            const deployContext = new DeployContext(serviceContext);
            deployContext.eventOutputs.topicArn = 'FakeTopicArn';

            const producerServiceContext = new ServiceContext(appName, envName, 'ProducerService', 'cloudwatchevent', { type: 'cloudwatchevent' }, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.eventRuleArn = 'FakeRuleArn';

            const addSnsPermissionStub = sandbox.stub(snsCalls, 'addSnsPermissionIfNotExists').resolves({});

            const consumeEventsContext = await sns.consumeEvents(serviceContext, deployContext, producerServiceContext, producerDeployContext);
            expect(addSnsPermissionStub.callCount).to.equal(1);
            expect(consumeEventsContext).to.be.instanceOf(ConsumeEventsContext);
        });

        it('should throw an error because SNS cant consume other services', async () => {
            const deployContext = new DeployContext(serviceContext);
            deployContext.eventOutputs.topicArn = 'FakeTopicArn';

            const producerServiceContext = new ServiceContext(appName, envName, 'ProducerService', 'otherService', { type: 'otherService' }, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.otherArn = 'FakeArn';

            try {
                const consumeEventsContext = await sns.consumeEvents(serviceContext, deployContext, producerServiceContext, producerDeployContext);
                expect(true).to.equal(false); // Should not get here
            }
            catch (err) {
                expect(err.message).to.contain('SNS - Unsupported event producer type given');
            }
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await sns.unDeploy(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
