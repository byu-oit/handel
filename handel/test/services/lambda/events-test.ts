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
    ServiceContext,
    ServiceEventType,
    ServiceType,
    ServiceConfig
} from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as iamCalls from '../../../src/aws/iam-calls';
import * as lambdaCalls from '../../../src/aws/lambda-calls';
import { LambdaServiceConfig } from '../../../src/services/lambda/config-types';
import * as lambdaEvents from '../../../src/services/lambda/events';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('lambdaCalls', () => {
    let sandbox: sinon.SinonSandbox;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    let accountConfig: AccountConfig;
    let ownServiceContext: ServiceContext<LambdaServiceConfig>;
    let ownDeployContext: DeployContext;

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        const serviceParams: LambdaServiceConfig = {
            type: 'lambda',
            path_to_code: '.',
            handler: 'index.handler',
            runtime: 'nodejs8.10'
        };
        ownServiceContext = new ServiceContext(appName, envName, 'consumerService', new ServiceType(STDLIB_PREFIX, 'lambda'), serviceParams, accountConfig);
        ownDeployContext = new DeployContext(ownServiceContext);
        ownDeployContext.eventOutputs = {
            resourceName: 'FakeFunctionName',
            resourceArn: 'FakeLambdaArn',
            resourcePrincipal: 'FakePrincipal',
            serviceEventType: ServiceEventType.Lambda
        };
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('event source mapping functions', () => {
        let producerServiceContext: ServiceContext<ServiceConfig>;
        let producerDeployContext: DeployContext;
        let createPolicyStub: sinon.SinonStub;
        let attachStreamPolicyStub: sinon.SinonStub;
        let addLambdaEventSourceMapping: sinon.SinonStub;

        beforeEach(() => {
            producerServiceContext = new ServiceContext(appName, envName, 'producerService', new ServiceType(STDLIB_PREFIX, 'dynamodb'), {type: 'dynamodb'}, accountConfig);
            producerDeployContext = new DeployContext(producerServiceContext);
            createPolicyStub = sandbox.stub(iamCalls, 'createOrUpdatePolicy').resolves({
                Arn: 'FakeArn'
            });
            attachStreamPolicyStub = sandbox.stub(iamCalls, 'attachPolicyToRole').resolves({});
            addLambdaEventSourceMapping = sandbox.stub(lambdaCalls, 'addLambdaEventSourceMapping').resolves({});
        });

        describe('consumeSqsEvents', () => {
            it('should add the required policy and event source mapping', async () => {
                it('should add the required policy and event source mapping', async () => {
                    producerDeployContext.eventOutputs = {
                        resourceName: 'FakeQueueName',
                        resourceArn: 'FakeSqsArn',
                        resourcePrincipal: 'FakePrincipal',
                        serviceEventType: ServiceEventType.SQS
                    };
                    const eventConsumerConfig = {
                        service_name: 'consumerService',
                        batch_size: 9
                    };
                    await lambdaEvents.consumeSqsEvents(ownServiceContext, ownDeployContext, eventConsumerConfig, producerServiceContext, producerDeployContext);

                    expect(createPolicyStub.callCount).to.equal(1);
                    expect(attachStreamPolicyStub.callCount).to.equal(1);
                    expect(addLambdaEventSourceMapping.callCount).to.equal(1);
                });
            });
        });

        describe('consumeDynamoEvents', () => {
            it('should add the required policy and event source mapping', async () => {
                producerDeployContext.eventOutputs = {
                    resourceName: 'FakeTableName',
                    resourceArn: 'arn:aws:dynamodb:us-west-2:111122223333:table/FakeService/stream/2015-05-11T21:21:33.291',
                    resourcePrincipal: 'FakePrincipal',
                    serviceEventType: ServiceEventType.DynamoDB
                };
                const eventConsumerConfig = {
                    service_name: 'consumerService',
                    batch_size: 100
                };
                await lambdaEvents.consumeDynamoEvents(ownServiceContext, ownDeployContext, eventConsumerConfig, producerServiceContext, producerDeployContext);

                expect(createPolicyStub.callCount).to.equal(1);
                expect(attachStreamPolicyStub.callCount).to.equal(1);
                expect(addLambdaEventSourceMapping.callCount).to.equal(1);
            });
        });
    });

    describe('addProducePermissions', () => {
        it('should add the given permission', async () => {
            const producerServiceContext = new ServiceContext(appName, envName, 'producerService', new ServiceType(STDLIB_PREFIX, 'sns'), {type: 'sns'}, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs = {
                resourceArn: 'FakeTopicArn',
                resourcePrincipal: 'FakePrincipal',
                serviceEventType: ServiceEventType.SNS
            };
            const addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').resolves({});

            await lambdaEvents.addProducePermissions(ownServiceContext, ownDeployContext, producerDeployContext);
            expect(addLambdaPermissionStub.callCount).to.equal(1);
        });
    });

    describe('deleteEventSourcePolicies', () => {
        it('should detach and delete all policies related to the event source', async () => {
            const getRoleStub = sandbox.stub(iamCalls, 'getRole').resolves({});
            const listPoliciesStub = sandbox.stub(iamCalls, 'listAttachedPolicies').resolves([
                {
                    UUID: 'FakeId1'
                },
                {
                    UUID: 'FakeId2'
                }
            ]);
            const detachPolicyStub = sandbox.stub(iamCalls, 'detachPolicyFromRole').resolves();
            const deletePolicyStub = sandbox.stub(iamCalls, 'deletePolicy').resolves();

            await lambdaEvents.deleteEventSourcePolicies('FakeRole');
            expect(getRoleStub.callCount).to.equal(1);
            expect(listPoliciesStub.callCount).to.equal(1);
            expect(detachPolicyStub.callCount).to.equal(2);
            expect(deletePolicyStub.callCount).to.equal(2);
        });
    });
});
