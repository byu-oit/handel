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
    ProduceEventsContext,
    ServiceContext,
    ServiceDeployer,
    ServiceEventConsumer,
    ServiceEventType,
    ServiceType,
    UnDeployContext
} from 'handel-extension-api';
import { deletePhases, deployPhase } from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as snsCalls from '../../../src/aws/sns-calls';
import { Service } from '../../../src/services/sns';
import { SnsServiceConfig } from '../../../src/services/sns/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('sns deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<SnsServiceConfig>;
    let serviceParams: SnsServiceConfig;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    const serviceName = 'FakeService';
    const serviceType = 'sns';
    let sns: ServiceDeployer;

    beforeEach(async () => {
        sns = new Service();
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        serviceParams = {
            type: serviceType,
            subscriptions: [{
                protocol: 'http',
                endpoint: 'fakeendpoint'
            }]
        };
        serviceContext = new ServiceContext(appName, envName, serviceName, new ServiceType(STDLIB_PREFIX, serviceType), serviceParams, accountConfig);
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    // At the moment, check only validates the JSON schema, so no tests here for that phase at the moment

    describe('deploy', () => {
        const topicName = 'FakeTopic';
        const topicArn = 'FakeArn';

        it('should deploy the topic', async () => {
            const ownPreDeployContext = new PreDeployContext(serviceContext);
            const deployStackStub = sandbox.stub(deployPhase, 'deployCloudFormationStack').returns(Promise.resolve({
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

            const deployContext = await sns.deploy!(serviceContext, ownPreDeployContext, []);
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
        const eventConsumerConfig: ServiceEventConsumer = {
            service_name: 'consumerService'
        };

        it('should subscribe the service to the topic when a lambda is given', async () => {
            const ownDeployContext = new DeployContext(serviceContext);
            ownDeployContext.eventOutputs = {
                resourceArn: 'FakeTopicArn',
                resourcePrincipal: 'FakePrincipal',
                serviceEventType: ServiceEventType.SNS
            };

            const consumerServiceContext = new ServiceContext(appName, envName, 'consumerService', new ServiceType(STDLIB_PREFIX, 'lambda'), {type: 'lambda'}, accountConfig);
            const consumerDeployContext = new DeployContext(consumerServiceContext);
            consumerDeployContext.eventOutputs = {
                resourceArn: 'FakeLambdaArn',
                resourcePrincipal: 'FakePrincipal',
                serviceEventType: ServiceEventType.Lambda
            };

            const subscribeToTopicStub = sandbox.stub(snsCalls, 'subscribeToTopic').resolves({});

            const produceEventsContext = await sns.produceEvents!(serviceContext, ownDeployContext, eventConsumerConfig, consumerServiceContext, consumerDeployContext);
            expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
            expect(subscribeToTopicStub.callCount).to.equal(1);
        });

        it('should return an error for any other service type', async () => {
            const ownDeployContext = new DeployContext(serviceContext);
            ownDeployContext.eventOutputs = {
                resourceArn: 'FakeTopicArn',
                resourcePrincipal: 'FakePrincipal',
                serviceEventType: ServiceEventType.SNS
            };

            const consumerServiceContext = new ServiceContext(appName, envName, 'consumerService', new ServiceType(STDLIB_PREFIX, 'efs'), {type: 'efs'}, accountConfig);
            const consumerDeployContext = new DeployContext(consumerServiceContext);
            consumerDeployContext.eventOutputs = {
                resourceArn: 'FakeArn',
                resourcePrincipal: 'FakePrincipal',
                serviceEventType: ServiceEventType.AlexaSkillKit
            };

            const subscribeToTopicStub = sandbox.stub(snsCalls, 'subscribeToTopic').resolves({});

            try {
                const produceEventsContext = await sns.produceEvents!(serviceContext, ownDeployContext, eventConsumerConfig, consumerServiceContext, consumerDeployContext);
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
        let deployContext: DeployContext;
        beforeEach(() => {
            deployContext = new DeployContext(serviceContext);
            deployContext.eventOutputs = {
                resourceArn: 'FakeTopicArn',
                resourcePrincipal: 'FakePrincipal',
                serviceEventType: ServiceEventType.SNS
            };
        });

        it('should consume cloud watch event service', async () => {
            const producerServiceContext = new ServiceContext(appName, envName, 'ProducerService', new ServiceType(STDLIB_PREFIX, 'cloudwatchevent'), {type: 'cloudwatchevent'}, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs = {
                resourceArn: 'FakeRuleArn',
                resourcePrincipal: 'FakePrincipal',
                serviceEventType: ServiceEventType.CloudWatchEvents
            };

            const addSnsPermissionStub = sandbox.stub(snsCalls, 'addSnsPermissionIfNotExists').resolves({});

            const eventConsumerConfig = { service_name: serviceName };
            const consumeEventsContext = await sns.consumeEvents!(serviceContext, deployContext, eventConsumerConfig, producerServiceContext, producerDeployContext);
            expect(addSnsPermissionStub.callCount).to.equal(1);
            expect(consumeEventsContext).to.be.instanceOf(ConsumeEventsContext);
        });

        it('should consume S3 event services', async () => {
            const producerServiceContext = new ServiceContext(appName, envName, 'ProducerService', new ServiceType(STDLIB_PREFIX, 's3'), {type: 's3'}, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs = {
                resourceArn: 'FakeBucketArn',
                resourcePrincipal: 'FakePrincipal',
                serviceEventType: ServiceEventType.S3
            };

            const addSnsPermissionStub = sandbox.stub(snsCalls, 'addSnsPermissionIfNotExists').resolves({});

            const eventConsumerConfig = { service_name: serviceName };
            const consumeEventsContext = await sns.consumeEvents!(serviceContext, deployContext, eventConsumerConfig, producerServiceContext, producerDeployContext);
            expect(addSnsPermissionStub.callCount).to.equal(1);
            expect(consumeEventsContext).to.be.instanceOf(ConsumeEventsContext);
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(deletePhases, 'unDeployService').resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await sns.unDeploy!(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
