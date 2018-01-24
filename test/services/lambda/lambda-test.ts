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
import { expect } from 'chai';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as iamCalls from '../../../src/aws/iam-calls';
import * as lambdaCalls from '../../../src/aws/lambda-calls';
import * as deletePhasesCommon from '../../../src/common/delete-phases-common';
import * as deployPhaseCommon from '../../../src/common/deploy-phase-common';
import * as lifecyclesCommon from '../../../src/common/lifecycles-common';
import * as preDeployPhaseCommon from '../../../src/common/pre-deploy-phase-common';
import { AccountConfig, ConsumeEventsContext, DeployContext, PreDeployContext, ServiceContext, UnDeployContext, UnPreDeployContext } from '../../../src/datatypes';
import * as lambda from '../../../src/services/lambda';
import awsWrapper from '../../../src/aws/aws-wrapper';
import { LambdaServiceConfig } from '../../../src/services/lambda/config-types';

describe('lambda deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<LambdaServiceConfig>;
    let serviceParams: LambdaServiceConfig;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'lambda',
            memory: 256,
            timeout: 5,
            path_to_code: '.',
            handler: 'index.handler',
            runtime: 'nodejs6.11',
            environment_variables: {
                MY_FIRST_VAR: 'my_first_value'
            }
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', 'FakeType', serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should require the path_to_code parameter', () => {
            delete serviceContext.params.path_to_code;
            const errors = lambda.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('\'path_to_code\' parameter is required');
        });

        it('should require the handler parameter', () => {
            delete serviceContext.params.handler;
            const errors = lambda.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('\'handler\' parameter is required');
        });

        it('should require the runtime parameter', () => {
            delete serviceContext.params.runtime;
            const errors = lambda.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('\'runtime\' parameter is required');
        });

        it('should work when things are configured properly', () => {
            const errors = lambda.check(serviceContext, []);
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
            dependenciesServiceContexts.push(new ServiceContext('FakeApp', 'FakeEnv', 'FakeDependency', 'mysql', serviceParams, accountConfig));
            const errors = lambda.check(serviceContext, dependenciesServiceContexts);
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
            const preDeployCreateSecurityGroup = sandbox.stub(preDeployPhaseCommon, 'preDeployCreateSecurityGroup').resolves(preDeployContext);

            const retContext = await lambda.preDeploy(serviceContext);
            expect(retContext).to.be.instanceof(PreDeployContext);
            expect(preDeployCreateSecurityGroup.callCount).to.equal(1);
            expect(retContext.securityGroups.length).to.equal(1);
        });

        it('should return an empty predeploy context when vpc is false', async () => {
            serviceContext.params.vpc = false;
            const preDeployNotRequiredStub = sandbox.stub(lifecyclesCommon, 'preDeployNotRequired').resolves(new PreDeployContext(serviceContext));

            const preDeployContext = await lambda.preDeploy(serviceContext);
            expect(preDeployContext).to.be.instanceof(PreDeployContext);
            expect(preDeployNotRequiredStub.callCount).to.equal(1);
        });
    });

    describe('deploy', () => {
        function getDependenciesDeployContexts() {
            const dependenciesDeployContexts: DeployContext[] = [];

            const otherServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService2', 'dynamodb', { type: 'dynamodb' }, serviceContext.accountConfig);
            const deployContext = new DeployContext(otherServiceContext);
            deployContext.environmentVariables.INJECTED_VAR = 'injectedValue';
            deployContext.policies.push({});

            return dependenciesDeployContexts;
        }

        it('should deploy the lambda', async () => {
            const uploadArtifactStub = sandbox.stub(deployPhaseCommon, 'uploadDeployableArtifactToHandelBucket').resolves({
                Key: 'FakeKey',
                Bucket: 'FakeBucket'
            });
            const functionArn = 'FakeFunctionArn';
            const functionName = 'FakeFunction';
            const deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').resolves({
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

            const deployContext = await lambda.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.eventOutputs.lambdaArn).to.equal(functionArn);
            expect(deployContext.eventOutputs.lambdaName).to.equal(functionName);
            expect(uploadArtifactStub.callCount).to.equal(1);
            expect(deployStackStub.callCount).to.equal(1);
        });
    });

    describe('consumeEvents', () => {
        let ownDeployContext: DeployContext;

        beforeEach(() => {
            ownDeployContext = new DeployContext(serviceContext);
            ownDeployContext.eventOutputs.lambdaName = 'FakeLambda';
        });

        it('should add permissions for the sns service type', async () => {
            const producerServiceContext = new ServiceContext(appName, envName, 'producerService', 'sns', { type: 'sns' }, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.principal = 'FakePrincipal';
            producerDeployContext.eventOutputs.topicArn = 'FakeTopicArn';

            const addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').resolves({});

            const consumeEventsContext = await lambda.consumeEvents(serviceContext, ownDeployContext, producerServiceContext, producerDeployContext);
            expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
            expect(addLambdaPermissionStub.callCount).to.equal(1);
        });

        it('should add permissions for the cloudwatchevent service type', async () => {
            const producerServiceContext = new ServiceContext(appName, envName, 'producerService', 'cloudwatchevent', { type: 'cloudwatchevent' }, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.principal = 'FakePrincipal';
            producerDeployContext.eventOutputs.eventRuleArn = 'FakeEventRuleArn';

            const addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').resolves({});

            const consumeEventsContext = await lambda.consumeEvents(serviceContext, ownDeployContext, producerServiceContext, producerDeployContext);
            expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
            expect(addLambdaPermissionStub.callCount).to.equal(1);
        });

        it('should add permissions for the alexaskillkit service type', async () => {
            const principal = 'alexa-appkit.amazon.com';
            const producerServiceContext = new ServiceContext(appName, envName, 'producerService', 'alexaskillkit', { type: 'alexaskillkit' }, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.principal = principal;
            const addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermission').resolves({});
            const policy = {
                Statement: [{
                    Principal: {
                        Service: 'OtherPrincipal'
                    },
                    Condition: {
                        ArnLike: {
                            'AWS:SourceArn': 'OtherSourceArn'
                        }
                    }
                }]
            };

            const getPolicyStub = sandbox.stub(awsWrapper.lambda, 'getPolicy').resolves({
                Policy: JSON.stringify(policy)
            });

            const consumeEventsContext = await lambda.consumeEvents(serviceContext, ownDeployContext, producerServiceContext, producerDeployContext);
            expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
            expect(addLambdaPermissionStub.callCount).to.equal(1);
        });

        it('should skip adding permissions for the alexaskillkit service type if it exists', async () => {
            const principal = 'alexa-appkit.amazon.com';
            const producerServiceContext = new ServiceContext(appName, envName, 'producerService', 'alexaskillkit', { type: 'alexaskillkit' }, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.principal = principal;
            const addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermission').resolves({});
            const policy = {
                Statement: [{
                    Principal: {
                        Service: principal
                    }
                }]
            };

            const getPolicyStub = sandbox.stub(awsWrapper.lambda, 'getPolicy').resolves({
                Policy: JSON.stringify(policy)
            });

            const consumeEventsContext = await lambda.consumeEvents(serviceContext, ownDeployContext, producerServiceContext, producerDeployContext);
            expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
            expect(addLambdaPermissionStub.callCount).to.equal(0);
        });

        it('should add permissions for the iot service type', async () => {
            const producerServiceContext = new ServiceContext(appName, envName, 'producerService', 'iot', { type: 'iot' }, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.principal = 'FakePrincipal';
            producerDeployContext.eventOutputs.topicRuleArnPrefix = 'FakeTopicRuleArnPrefix';

            const addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').resolves({});

            const consumeEventsContext = await lambda.consumeEvents(serviceContext, ownDeployContext, producerServiceContext, producerDeployContext);
            expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
            expect(addLambdaPermissionStub.callCount).to.equal(1);
        });

        it('should add permissions for the dynamodb service type', async () => {
            const producerServiceContext = new ServiceContext(appName, envName, 'producerService', 'dynamodb', { type: 'dynamodb' }, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.principal = 'FakePrincipal';
            producerDeployContext.eventOutputs.topicRuleArnPrefix = 'FakeTopicRuleArnPrefix';
            producerDeployContext.eventOutputs.tableStreamArn = 'arn:aws:dynamodb:us-west-2:111122223333:table/FakeService/stream/2015-05-11T21:21:33.291';

            const attachStreamPolicyStub = sandbox.stub(iamCalls, 'attachStreamPolicy').resolves({});
            const addLambdaEventSourceMapping = sandbox.stub(lambdaCalls, 'addLambdaEventSourceMapping').resolves({});
            producerDeployContext.eventOutputs.lambdaConsumers = [
                {
                    'serviceName': 'FakeService',
                    'batch_size': 100
                }
            ];
            const consumeEventsContext = await lambda.consumeEvents(serviceContext, ownDeployContext, producerServiceContext, producerDeployContext);
            expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
            expect(attachStreamPolicyStub.callCount).to.equal(1);
            expect(addLambdaEventSourceMapping.callCount).to.equal(1);
        });

        it('should return an error for any other service type', async () => {
            const producerServiceContext = new ServiceContext(appName, envName, 'producerService', 'efs', { type: 'efs' }, accountConfig);
            const producerDeployContext = new DeployContext(producerServiceContext);

            const addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').resolves({});

            try {
                const consumeEventsContext = await lambda.consumeEvents(serviceContext, ownDeployContext, producerServiceContext, producerDeployContext);
                expect(true).to.equal(false); // Should not get here
            }
            catch (err) {
                expect(err.message).to.contain('Unsupported event producer type given');
                expect(addLambdaPermissionStub.callCount).to.equal(0);
            }
        });
    });

    describe('unPreDeploy', () => {
        it('should return an empty UnPreDeploy context if vpc is false', async () => {
            const unPreDeployNotRequiredStub = sandbox.stub(lifecyclesCommon, 'unPreDeployNotRequired').resolves(new UnPreDeployContext(serviceContext));
            serviceContext.params.vpc = false;
            const unPreDeployContext = await lambda.unPreDeploy(serviceContext);
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployNotRequiredStub.callCount).to.equal(1);
        });

        it('should delete the security groups if vpc is true and return the unPreDeploy context', async () => {
            serviceContext.params.vpc = true;
            const unPreDeploySecurityGroup = sandbox.stub(deletePhasesCommon, 'unPreDeploySecurityGroup').resolves(new UnPreDeployContext(serviceContext));
            const unPreDeployContext = await lambda.unPreDeploy(serviceContext);
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeploySecurityGroup.callCount).to.equal(1);
        });
    });

    describe('unDeploy', () => {
        it('should delete the stack', async () => {
            const detachPoliciesFromRoleStub = sandbox.stub(iamCalls, 'detachPoliciesFromRole').resolves();
            const unDeployStack = sandbox.stub(deletePhasesCommon, 'unDeployService').resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await lambda.unDeploy(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStack.callCount).to.equal(1);
            expect(detachPoliciesFromRoleStub.callCount).to.equal(1);
        });
    });
});
