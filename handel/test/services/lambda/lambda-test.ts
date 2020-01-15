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
    ServiceDeployer,
    ServiceEventType,
    ServiceType,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import { deletePhases, deployPhase, preDeployPhase } from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as lambdaCalls from '../../../src/aws/lambda-calls';
import * as lifecyclesCommon from '../../../src/common/lifecycles-common';
import {
} from '../../../src/datatypes';
import { Service } from '../../../src/services/lambda';
import { LambdaServiceConfig } from '../../../src/services/lambda/config-types';
import * as lambdaEvents from '../../../src/services/lambda/events';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('lambda deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<LambdaServiceConfig>;
    let serviceParams: LambdaServiceConfig;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    const lambdaServiceName = 'FakeService';
    let lambda: ServiceDeployer;

    beforeEach(async () => {
        lambda = new Service();
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.createSandbox();
        serviceParams = {
            type: 'lambda',
            memory: 256,
            timeout: 5,
            path_to_code: '.',
            handler: 'index.handler',
            runtime: 'nodejs12.x',
            environment_variables: {
                MY_FIRST_VAR: 'my_first_value'
            }
        };
        serviceContext = new ServiceContext(appName, envName, lambdaServiceName, new ServiceType(STDLIB_PREFIX, 'FakeType'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should require the path_to_code parameter', () => {
            delete serviceContext.params.path_to_code;
            const errors = lambda.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('\'path_to_code\' parameter is required');
        });

        it('should require the handler parameter', () => {
            delete serviceContext.params.handler;
            const errors = lambda.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('\'handler\' parameter is required');
        });

        it('should require the runtime parameter', () => {
            delete serviceContext.params.runtime;
            const errors = lambda.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('\'runtime\' parameter is required');
        });

        it('should work when things are configured properly', () => {
            const errors = lambda.check!(serviceContext, []);
            expect(errors.length).to.equal(0);
        });

        it('should fail if vpc is false and a dependency producing security groups is declared', () => {
            serviceContext.params = {
                type: 'lambda',
                path_to_code: '.',
                handler: 'index.handler',
                runtime: 'node.js6.3',
                dependencies: [
                    'FakeDependency'
                ]
            };

            const dependenciesServiceContexts = [];
            dependenciesServiceContexts.push(new ServiceContext('FakeApp', 'FakeEnv', 'FakeDependency', new ServiceType(STDLIB_PREFIX, 'mysql'), serviceParams, accountConfig,
                        {}, {
                            producedDeployOutputTypes: ['securityGroups'],
                            consumedDeployOutputTypes: [],
                            producedEventsSupportedTypes: []
                        }
                    ));
            const errors = lambda.check!(serviceContext, dependenciesServiceContexts);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('\'vpc\' parameter is required and must be true when declaring dependencies of type');
        });

    });

    describe('preDeploy', () => {
        it('should create security groups and return the predeploy context when vpc is true', async () => {
            serviceContext.params.vpc = true;
            const preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push({
                GroupId: 'FakeSecurityGroup'
            });
            const preDeployCreateSecurityGroup = sandbox.stub(preDeployPhase, 'preDeployCreateSecurityGroup').resolves(preDeployContext);

            const retContext = await lambda.preDeploy!(serviceContext);
            expect(retContext).to.be.instanceof(PreDeployContext);
            expect(preDeployCreateSecurityGroup.callCount).to.equal(1);
            expect(retContext.securityGroups.length).to.equal(1);
        });

        it('should return an empty predeploy context when vpc is false', async () => {
            serviceContext.params.vpc = false;
            const preDeployNotRequiredStub = sandbox.stub(lifecyclesCommon, 'preDeployNotRequired').resolves(new PreDeployContext(serviceContext));

            const preDeployContext = await lambda.preDeploy!(serviceContext);
            expect(preDeployContext).to.be.instanceof(PreDeployContext);
            expect(preDeployNotRequiredStub.callCount).to.equal(1);
        });
    });

    describe('deploy', () => {
        function getDependenciesDeployContexts() {
            const dependenciesDeployContexts: DeployContext[] = [];

            const otherServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService2', new ServiceType(STDLIB_PREFIX, 'dynamodb'), {type: 'dynamodb'}, serviceContext.accountConfig);
            const deployContext = new DeployContext(otherServiceContext);
            deployContext.environmentVariables.INJECTED_VAR = 'injectedValue';
            deployContext.policies.push({});

            return dependenciesDeployContexts;
        }

        it('should deploy the lambda', async () => {
            const uploadArtifactStub = sandbox.stub(deployPhase, 'uploadDeployableArtifactToHandelBucket').resolves({
                Key: 'FakeKey',
                Bucket: 'FakeBucket'
            });
            const functionArn = 'FakeFunctionArn';
            const functionName = 'FakeFunction';
            const deployStackStub = sandbox.stub(deployPhase, 'deployCloudFormationStack').resolves({
                Outputs: [
                    {
                        OutputKey: 'FunctionArn',
                        OutputValue: functionArn,
                    },
                    {
                        OutputKey: 'FunctionName',
                        OutputValue: functionName
                    }
                ]
            });

            const ownPreDeployContext = new PreDeployContext(serviceContext);
            const dependenciesDeployContexts = getDependenciesDeployContexts();

            const deployContext = await lambda.deploy!(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.eventOutputs!.resourceArn).to.equal(functionArn);
            expect(deployContext.eventOutputs!.resourceName).to.equal(functionName);
            expect(uploadArtifactStub.callCount).to.equal(1);
            expect(deployStackStub.callCount).to.equal(1);
        });
    });

    describe('consumeEvents', () => {
        let ownDeployContext: DeployContext;

        beforeEach(() => {
            ownDeployContext = new DeployContext(serviceContext);
            ownDeployContext.eventOutputs = {
                resourceName: 'FakeLambda',
                resourcePrincipal: 'FakePrincipal',
                serviceEventType: ServiceEventType.Lambda
            };
        });

        it('should add an event source mapping for the dynamodb service type', async () => {
            const consumeEventsStub = sandbox.stub(lambdaEvents, 'consumeDynamoEvents').resolves({});
            const producerServiceContext = new ServiceContext(appName, envName, 'producerService', new ServiceType(STDLIB_PREFIX, 'dynamodb'), {type: 'dynamodb'}, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs = {
                resourceName: 'FakeFunctionName',
                resourceArn: 'arn:aws:dynamodb:us-west-2:111122223333:table/FakeService/stream/2015-05-11T21:21:33.291',
                resourcePrincipal: 'FakePrincipal',
                serviceEventType: ServiceEventType.DynamoDB
            };
            const eventConsumerConfig = {
                service_name: lambdaServiceName,
                batch_size: 100
            };

            const consumeEventsContext = await lambda.consumeEvents!(serviceContext, ownDeployContext, eventConsumerConfig, producerServiceContext, producerDeployContext);
            expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
            expect(consumeEventsStub.callCount).to.equal(1);
        });

        it('should add an event source mapping for the SQS service type', async () => {
            const consumeEventsStub = sandbox.stub(lambdaEvents, 'consumeSqsEvents').resolves({});
            const producerServiceContext = new ServiceContext(appName, envName, 'producerService', new ServiceType(STDLIB_PREFIX, 'sns'), {type: 'sns'}, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs = {
                resourceName: 'FakeFunctionName',
                resourceArn: 'FakeSqsArn',
                resourcePrincipal: 'FakePrincipal',
                serviceEventType: ServiceEventType.SQS
            };
            const eventConsumerConfig = {
                service_name: lambdaServiceName,
                batch_size: 9
            };

            const consumeEventsContext = await lambda.consumeEvents!(serviceContext, ownDeployContext, eventConsumerConfig, producerServiceContext, producerDeployContext);
            expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
            expect(consumeEventsStub.callCount).to.equal(1);
        });

        it('should add permissions for all other service type', async () => {
            const producerServiceContext = new ServiceContext(appName, envName, 'producerService', new ServiceType(STDLIB_PREFIX, 'sns'), {type: 'sns'}, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs = {
                resourceArn: 'FakeTopicArn',
                resourcePrincipal: 'FakePrincipal',
                serviceEventType: ServiceEventType.SNS
            };
            const addPermissionsStub = sandbox.stub(lambdaEvents, 'addProducePermissions').resolves({});

            const eventConsumerConfig = { service_name: lambdaServiceName };
            const consumeEventsContext = await lambda.consumeEvents!(serviceContext, ownDeployContext, eventConsumerConfig, producerServiceContext, producerDeployContext);
            expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
            expect(addPermissionsStub.callCount).to.equal(1);
        });
    });

    describe('unPreDeploy', () => {
        it('should return an empty UnPreDeploy context if vpc is false', async () => {
            const unPreDeployNotRequiredStub = sandbox.stub(lifecyclesCommon, 'unPreDeployNotRequired').resolves(new UnPreDeployContext(serviceContext));
            serviceContext.params.vpc = false;
            const unPreDeployContext = await lambda.unPreDeploy!(serviceContext);
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployNotRequiredStub.callCount).to.equal(1);
        });

        it('should delete the security groups if vpc is true and return the unPreDeploy context', async () => {
            serviceContext.params.vpc = true;
            const unPreDeploySecurityGroup = sandbox.stub(deletePhases, 'unPreDeploySecurityGroup').resolves(new UnPreDeployContext(serviceContext));
            const unPreDeployContext = await lambda.unPreDeploy!(serviceContext);
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeploySecurityGroup.callCount).to.equal(1);
        });
    });

    describe('unDeploy', () => {
        it('should delete the stack', async () => {
            const deleteMappingsStub = sandbox.stub(lambdaCalls, 'deleteAllEventSourceMappings').resolves();
            const deleteEventSourcePoliciesStub = sandbox.stub(lambdaEvents, 'deleteEventSourcePolicies').resolves();
            const unDeployStack = sandbox.stub(deletePhases, 'unDeployService').resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await lambda.unDeploy!(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStack.callCount).to.equal(1);
            expect(deleteMappingsStub.callCount).to.equal(1);
            expect(deleteEventSourcePoliciesStub.callCount).to.equal(1);
        });
    });
});
