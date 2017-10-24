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
const lambda = require('../../../lib/services/lambda');
const lambdaCalls = require('../../../lib/aws/lambda-calls');
const iamCalls = require('../../../lib/aws/iam-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const ConsumeEventsContext = require('../../../lib/datatypes/consume-events-context');
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const preDeployPhaseCommon = require('../../../lib/common/pre-deploy-phase-common');
const lifecyclesCommon = require('../../../lib/common/lifecycles-common');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../../lib/account-config/account-config');

describe('lambda deployer', function () {
    let sandbox;
    let serviceContext;
    let appName = "FakeApp";
    let envName = "FakeEnv";

    beforeEach(function () {
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext(appName, envName, "FakeService", "FakeType", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require the path_to_code parameter', function () {
            serviceContext.params = {
                handler: 'index.handler',
                runtime: 'nodejs6.11'
            }
            let errors = lambda.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'path_to_code' parameter is required");
        });

        it('should require the handler parameter', function () {
            serviceContext.params = {
                path_to_code: '.',
                runtime: 'nodejs6.11'
            }
            let errors = lambda.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'handler' parameter is required");
        });

        it('should require the runtime parameter', function () {
            serviceContext.params = {
                path_to_code: '.',
                handler: 'index.handler'
            }
            let errors = lambda.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'runtime' parameter is required");
        });

        it('should work when things are configured properly', function () {
            serviceContext.params = {
                path_to_code: '.',
                runtime: 'nodejs6.11',
                handler: 'index.handler'
            }
            let errors = lambda.check(serviceContext);
            expect(errors.length).to.equal(0);
        });

        it('should fail if vpc is false and a dependency producing security groups is declared', function () {
            serviceContext.params = {
                path_to_code: '.',
                handler: 'index.handler',
                runtime: 'node.js6.3',
                dependencies: [
                    "FakeDependency"
                ]
            }
            let dependenciesServiceContexts = [];
            dependenciesServiceContexts.push(new ServiceContext("FakeApp", "FakeEnv", "FakeDependency", "mysql", {}, {}))
            let errors = lambda.check(serviceContext, dependenciesServiceContexts);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'vpc' parameter is required and must be true when declaring dependencies of type");
        });

    });

    describe('preDeploy', function () {
        it('should create security groups and return the predeploy context when vpc is true', function () {
            serviceContext.params = {
                "vpc": true
            }
            let response = new PreDeployContext(serviceContext)
            response.securityGroups.push("FakeSecurityGroup")
            let preDeployCreateSecurityGroup = sandbox.stub(preDeployPhaseCommon, 'preDeployCreateSecurityGroup')
                .returns(Promise.resolve(response));

            return lambda.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                    expect(preDeployCreateSecurityGroup.callCount).to.equal(1);
                    expect(preDeployContext.securityGroups.length).to.equal(1);
                });
        });

        it('should return an empty predeploy context when vpc is false', function () {
            serviceContext.params = {
                "vpc": false
            }
            let preDeployNotRequiredStub = sandbox.stub(lifecyclesCommon, 'preDeployNotRequired').returns(Promise.resolve(new PreDeployContext(serviceContext)));

            return lambda.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                    expect(preDeployNotRequiredStub.callCount).to.equal(1);
                });
        });
    });

    describe('deploy', function () {
        beforeEach(function () {
            serviceContext.params = {
                memory: 256,
                timeout: 5,
                path_to_code: ".",
                handler: 'index.handler',
                runtime: 'nodejs6.11',
                environment_variables: {
                    MY_FIRST_VAR: 'my_first_value'
                }
            }
        });

        function getPreDeployContext(serviceContext) {
            return new PreDeployContext(serviceContext);
        }

        function getDependenciesDeployContexts() {
            let dependenciesDeployContexts = [];

            let otherServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService2", "dynamodb", {}, serviceContext.accountConfig);
            let deployContext = new DeployContext(otherServiceContext);
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

            let ownPreDeployContext = getPreDeployContext(serviceContext);
            let dependenciesDeployContexts = getDependenciesDeployContexts();

            return lambda.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts)
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
        let ownDeployContext;

        beforeEach(function () {
            ownDeployContext = new DeployContext(serviceContext);
            ownDeployContext.eventOutputs.lambdaName = "FakeLambda";
        });

        it('should add permissions for the sns service type', function () {
            let producerServiceContext = new ServiceContext(appName, envName, "producerService", "sns", {}, {});
            let producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.principal = "FakePrincipal";
            producerDeployContext.eventOutputs.topicArn = "FakeTopicArn";

            let addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').returns(Promise.resolve({}));

            return lambda.consumeEvents(serviceContext, ownDeployContext, producerServiceContext, producerDeployContext)
                .then(consumeEventsContext => {
                    expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
                    expect(addLambdaPermissionStub.calledOnce).to.be.true;
                });
        });

        it('should add permissions for the cloudwatchevent service type', function () {
            let producerServiceContext = new ServiceContext(appName, envName, "producerService", "cloudwatchevent", {}, {});
            let producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.principal = "FakePrincipal";
            producerDeployContext.eventOutputs.eventRuleArn = "FakeEventRuleArn";

            let addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').returns(Promise.resolve({}));

            return lambda.consumeEvents(serviceContext, ownDeployContext, producerServiceContext, producerDeployContext)
                .then(consumeEventsContext => {
                    expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
                    expect(addLambdaPermissionStub.calledOnce).to.be.true;
                });
        });

        it('should add permissions for the alexaskillkit service type', function () {
            let producerServiceContext = new ServiceContext(appName, envName, "producerService", "alexaskillkit", {}, {});
            let producerDeployContext = new DeployContext(producerServiceContext);
            let addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').returns(Promise.resolve({}));

            return lambda.consumeEvents(serviceContext, ownDeployContext, producerServiceContext, producerDeployContext)
                .then(consumeEventsContext => {
                    expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
                    expect(addLambdaPermissionStub.callCount).to.equal(1);
                });
        });

        it('should add permissions for the iot service type', function () {
            let producerServiceContext = new ServiceContext(appName, envName, "producerService", "iot", {}, {});
            let producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.principal = "FakePrincipal";
            producerDeployContext.eventOutputs.topicRuleArnPrefix = "FakeTopicRuleArnPrefix";

            let addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').returns(Promise.resolve({}));

            return lambda.consumeEvents(serviceContext, ownDeployContext, producerServiceContext, producerDeployContext)
                .then(consumeEventsContext => {
                    expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
                    expect(addLambdaPermissionStub.callCount).to.equal(1);
                });
        });

        it('should add permissions for the dynamodb service type', function () {
            let producerServiceContext = new ServiceContext(appName, envName, "producerService", "dynamodb", {}, {});
            let producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.principal = "FakePrincipal";
            producerDeployContext.eventOutputs.topicRuleArnPrefix = "FakeTopicRuleArnPrefix";
            producerDeployContext.eventOutputs.tableStreamArn = "arn:aws:dynamodb:us-west-2:111122223333:table/FakeService/stream/2015-05-11T21:21:33.291"

            let attachStreamPolicyStub = sandbox.stub(iamCalls, 'attachStreamPolicy').returns(Promise.resolve({}));
            let addLambdaEventSourceMapping = sandbox.stub(lambdaCalls, 'addLambdaEventSourceMapping').returns(Promise.resolve({}));
            producerDeployContext.eventOutputs.lambdaConsumers = [
                {
                    "serviceName": "FakeService",
                    "batch_size": 100
                }
            ]
            return lambda.consumeEvents(serviceContext, ownDeployContext, producerServiceContext, producerDeployContext)
                .then(consumeEventsContext => {
                    expect(consumeEventsContext).to.be.instanceof(ConsumeEventsContext);
                    expect(attachStreamPolicyStub.callCount).to.equal(1);
                    expect(addLambdaEventSourceMapping.callCount).to.equal(1);
                });
        });

        it('should return an error for any other service type', function () {
            let producerServiceContext = new ServiceContext(appName, envName, "producerService", "efs", {}, {});
            let producerDeployContext = new DeployContext(producerServiceContext);

            let addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermissionIfNotExists').returns(Promise.resolve({}));

            return lambda.consumeEvents(serviceContext, ownDeployContext, producerServiceContext, producerDeployContext)
                .then(consumeEventsContext => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Unsupported event producer type given");
                    expect(addLambdaPermissionStub.notCalled).to.be.true;
                });
        });
    });

    describe('unPreDeploy', function () {
        it('should return an empty UnPreDeploy context if vpc is false', function () {
            let unPreDeployNotRequiredStub = sandbox.stub(lifecyclesCommon, 'unPreDeployNotRequired').returns(Promise.resolve(new UnPreDeployContext({})));
            serviceContext.params = {
                vpc: false
            }
            return lambda.unPreDeploy(serviceContext)
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeployNotRequiredStub.callCount).to.equal(1);
                });
        });

        it('should delete the security groups if vpc is true and return the unPreDeploy context', function () {
            serviceContext.params = {
                vpc: true
            }
            let unPreDeploySecurityGroup = sandbox.stub(deletePhasesCommon, 'unPreDeploySecurityGroup').returns(Promise.resolve(new UnPreDeployContext(serviceContext)));
            return lambda.unPreDeploy(serviceContext)
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeploySecurityGroup.callCount).to.equal(1);
                });
        });
    });

    describe('unDeploy', function () {
        it('should delete the stack', function () {
            let detachPoliciesFromRoleStub = sandbox.stub(iamCalls, 'detachPoliciesFromRole').returns(Promise.resolve())
            let unDeployStack = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return lambda.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStack.calledOnce).to.be.true;
                    expect(detachPoliciesFromRoleStub.calledOnce).to.be.true;
                });
        });
    });
});
