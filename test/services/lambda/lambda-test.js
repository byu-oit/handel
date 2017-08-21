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
const accountConfig = require('../../../lib/common/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const lambda = require('../../../lib/services/lambda');
const lambdaCalls = require('../../../lib/aws/lambda-calls');
const iamCalls = require('../../../lib/aws/iam-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const ConsumeEventsContext = require('../../../lib/datatypes/consume-events-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const UnBindContext = require('../../../lib/datatypes/un-bind-context');
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const preDeployPhaseCommon = require('../../../lib/common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../../lib/common/bind-phase-common');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('lambda deployer', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require the path_to_code parameter', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                handler: 'index.handler',
                runtime: 'nodejs6.11'
            });
            let errors = lambda.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'path_to_code' parameter is required");
        });

        it('should require the handler parameter', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                path_to_code: '.',
                runtime: 'nodejs6.11'
            });
            let errors = lambda.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'handler' parameter is required");
        });

        it('should require the runtime parameter', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                path_to_code: '.',
                handler: 'index.handler'
            });
            let errors = lambda.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'runtime' parameter is required");
        });

        it('should work when things are configured properly', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                path_to_code: '.',
                runtime: 'nodejs6.11',
                handler: 'index.handler'
            });
            let errors = lambda.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('preDeploy', function () {
        it('should return an empty predeploy context since it doesnt do anything', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let preDeployNotRequiredStub = sandbox.stub(preDeployPhaseCommon, 'preDeployNotRequired').returns(Promise.resolve(new PreDeployContext(serviceContext)));

            return lambda.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                    expect(preDeployNotRequiredStub.callCount).to.equal(1);
                });
        });
    });

    describe('bind', function () {
        it('should return an empty bind context since it doesnt do anything', function () {
            let bindNotRequiredStub = sandbox.stub(bindPhaseCommon, 'bindNotRequired').returns(Promise.resolve(new BindContext({}, {})));

            return lambda.bind({}, {}, {}, {})
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                    expect(bindNotRequiredStub.callCount).to.equal(1);
                });
        });
    });

    describe('deploy', function () {
        function getServiceContext() {
            return new ServiceContext("FakeApp", "FakeEnv", "FakeService", "lambda", "1", {
                memory: 256,
                timeout: 5,
                path_to_code: ".",
                handler: 'index.handler',
                runtime: 'nodejs6.11',
                environment_variables: {
                    MY_FIRST_VAR: 'my_first_value'
                }
            });
        }

        function getPreDeployContext(serviceContext) {
            return new PreDeployContext(serviceContext);
        }

        function getDependenciesDeployContexts() {
            let dependenciesDeployContexts = [];

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService2", "dynamodb", "1", {

            });
            let deployContext = new DeployContext(serviceContext);
            deployContext.environmentVariables['INJECTED_VAR'] = 'injectedValue';
            deployContext.policies.push({});

            return dependenciesDeployContexts;
        }


        it('should deploy the lambda', function () {
            let uploadArtifactStub = sandbox.stub(deployPhaseCommon, 'uploadDeployableArtifactToHandelBucket').returns(Promise.resolve({
                Key: "FakeKey",
                Bucket: "FakeBucket"
            }));
            let functionArn = "FakeFunctionArn";
            let functionName = "FakeFunction";
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
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
            }));

            let ownServiceContext = getServiceContext();
            let ownPreDeployContext = getPreDeployContext(ownServiceContext);
            let dependenciesDeployContexts = getDependenciesDeployContexts();

            return lambda.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.eventOutputs.lambdaArn).to.equal(functionArn);
                    expect(deployContext.eventOutputs.lambdaName).to.equal(functionName);
                    expect(uploadArtifactStub.calledOnce).to.be.true;
                    expect(deployStackStub.calledOnce).to.be.true;
                });
        });
    });

    describe('consumeEvents', function () {
        let appName = "FakeApp";
        let envName = "FakeEnv";
        let deployVersion = "1";
        let ownServiceContext = new ServiceContext(appName, envName, "consumerService", "lambda", deployVersion, {});
        let ownDeployContext = new DeployContext(ownServiceContext);
        ownDeployContext.eventOutputs.lambdaName = "FakeLambda";

        it('should add permissions for the sns service type', function () {
            let producerServiceContext = new ServiceContext(appName, envName, "producerService", "sns", deployVersion, {});
            let producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.principal = "FakePrincipal";
            producerDeployContext.eventOutputs.topicArn = "FakeTopicArn";

            let addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').returns(Promise.resolve({}));

            return lambda.consumeEvents(ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext)
                .then(consumeEventsContext => {
                    expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
                    expect(addLambdaPermissionStub.calledOnce).to.be.true;
                });
        });

        it('should add permissions for the cloudwatchevent service type', function () {
            let producerServiceContext = new ServiceContext(appName, envName, "producerService", "cloudwatchevent", deployVersion, {});
            let producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.principal = "FakePrincipal";
            producerDeployContext.eventOutputs.eventRuleArn = "FakeEventRuleArn";

            let addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').returns(Promise.resolve({}));

            return lambda.consumeEvents(ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext)
                .then(consumeEventsContext => {
                    expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
                    expect(addLambdaPermissionStub.calledOnce).to.be.true;
                });
        });

        it('should add permissions for the alexaskillkit service type', function () {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let ownServiceContext = new ServiceContext(appName, envName, "consumerService", "lambda", deployVersion, {});
            let ownDeployContext = new DeployContext(ownServiceContext);
            ownDeployContext.eventOutputs.lambdaName = "FakeLambda";

            let producerServiceContext = new ServiceContext(appName, envName, "producerService", "alexaskillkit", deployVersion, {});
            let producerDeployContext = new DeployContext(producerServiceContext);
            let addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').returns(Promise.resolve({}));

            return lambda.consumeEvents(ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext)
                .then(consumeEventsContext => {
                    expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
                    expect(addLambdaPermissionStub.callCount).to.equal(1);
                });
        });

        it('should add permissions for the iot service type', function () {
            let producerServiceContext = new ServiceContext(appName, envName, "producerService", "iot", deployVersion, {});
            let producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.principal = "FakePrincipal";
            producerDeployContext.eventOutputs.topicRuleArnPrefix = "FakeTopicRuleArnPrefix";

            let addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').returns(Promise.resolve({}));

            return lambda.consumeEvents(ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext)
                .then(consumeEventsContext => {
                    expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
                    expect(addLambdaPermissionStub.callCount).to.equal(1);
                });
        });

        it('should add permissions for the dynamodb service type', function () {
            let producerServiceContext = new ServiceContext(appName, envName, "producerService", "dynamodb", deployVersion, {});
            let producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.principal = "FakePrincipal";
            producerDeployContext.eventOutputs.topicRuleArnPrefix = "FakeTopicRuleArnPrefix";
            producerDeployContext.eventOutputs.tableStreamArn = "arn:aws:dynamodb:us-west-2:111122223333:table/consumerService/stream/2015-05-11T21:21:33.291"

            let attachStreamPolicyStub = sandbox.stub(iamCalls, 'attachStreamPolicy').returns(Promise.resolve({}));
            let addLambdaEventSourceMapping = sandbox.stub(lambdaCalls, 'addLambdaEventSourceMapping').returns(Promise.resolve({}));
            producerDeployContext.eventOutputs.lambdaConsumers = [
                {
                    "serviceName": "consumerService",
                    "batch_size": 100
                }
            ]
            return lambda.consumeEvents(ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext)
                .then(consumeEventsContext => {
                    expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
                    expect(attachStreamPolicyStub.callCount).to.equal(1);
                    expect(addLambdaEventSourceMapping.callCount).to.equal(1);
                });
        });

        it('should return an error for any other service type', function () {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let ownServiceContext = new ServiceContext(appName, envName, "consumerService", "lambda", deployVersion, {});
            let ownDeployContext = new DeployContext(ownServiceContext);
            ownDeployContext.eventOutputs.lambdaName = "FakeLambda";

            let producerServiceContext = new ServiceContext(appName, envName, "producerService", "efs", deployVersion, {});
            let producerDeployContext = new DeployContext(producerServiceContext);

            let addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').returns(Promise.resolve({}));

            return lambda.consumeEvents(ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext)
                .then(consumeEventsContext => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Unsupported event producer type given");
                    expect(addLambdaPermissionStub.notCalled).to.be.true;
                });
        });
    });

    describe('produceEvents', function () {
        it('should throw an error because Lambda doesnt produce events for other services', function () {
            return lambda.produceEvents(null, null, null, null)
                .then(produceEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Lambda service doesn't produce events");
                });
        });
    });

    describe('unPreDeploy', function () {
        it('should return an empty UnPreDeploy context', function () {
            let unPreDeployNotRequiredStub = sandbox.stub(deletePhasesCommon, 'unPreDeployNotRequired').returns(Promise.resolve(new UnPreDeployContext({})));
            return lambda.unPreDeploy({})
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeployNotRequiredStub.callCount).to.equal(1);
                });
        });
    });

    describe('unBind', function () {
        it('should return an empty UnBind context', function () {
            let unBindNotRequiredStub = sandbox.stub(deletePhasesCommon, 'unBindNotRequired').returns(Promise.resolve(new UnBindContext({})));
            return lambda.unBind({})
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                    expect(unBindNotRequiredStub.callCount).to.equal(1);
                });
        });
    });

    describe('unDeploy', function () {
        it('should delete the stack', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let detachPoliciesFromRoleStub = sandbox.stub(iamCalls, 'detachPoliciesFromRole').returns(Promise.resolve())
            let unDeployStack = sandbox.stub(deletePhasesCommon, 'unDeployCloudFormationStack').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return lambda.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStack.calledOnce).to.be.true;
                    expect(detachPoliciesFromRoleStub.calledOnce).to.be.true;
                });
        });
    });
});