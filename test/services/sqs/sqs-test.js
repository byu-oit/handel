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
const sqs = require('../../../lib/services/sqs');
const sqsCalls = require('../../../lib/aws/sqs-calls');
const cloudfFormationCalls = require('../../../lib/aws/cloudformation-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const ConsumeEventsContext = require('../../../lib/datatypes/consume-events-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const deployersCommon = require('../../../lib/common/deployers-common');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const UnBindContext = require('../../../lib/datatypes/un-bind-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('sqs deployer', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('check', function() {
        it('shouldnt validate anything yet', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let errors = sqs.check(serviceContext);
            expect(errors).to.deep.equal([]);
        });
    });

    describe('preDeploy', function() {
        it('should return an empty predeploy context since it doesnt do anything', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return sqs.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                    expect(preDeployContext.appName).to.equal(serviceContext.appName);
                });
        });
    });

    describe('bind', function() {
        it('should return an empty bind context since it doesnt do anything', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return sqs.bind(serviceContext)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                    expect(bindContext.dependencyServiceContext.appName).to.equal(serviceContext.appName);
                });
        });
    });

    describe('deploy', function() {
        let appName = "FakeApp";
        let envName = "FakeEnv";
        let serviceName = "FakeService";
        let serviceType = "sqs";
        let queueName = "FakeQueue";
        let queueArn = "FakeArn";
        let queueUrl = "FakeUrl";

        let ownServiceContext = new ServiceContext(appName, envName, serviceName, serviceType, "1", {
            type: 'sqs',
            queue_type: 'fifo',
            content_based_deduplication: true,
            delay_seconds: 2,
            max_message_size: 262140,
            message_retention_period: 345601,
            visibility_timeout: 40
        });
        let ownPreDeployContext = new PreDeployContext(ownServiceContext);

        it('should create a new queue when the stack doesnt exist', function() {

            let getStackStub = sandbox.stub(cloudfFormationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudfFormationCalls, 'createStack').returns(Promise.resolve({
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
                    }
                ]
            }));

            return sqs.deploy(ownServiceContext, ownPreDeployContext, [])
                .then(deployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(createStackStub.calledOnce).to.be.true;

                    expect(deployContext).to.be.instanceof(DeployContext);

                    //Should have exported 3 env vars
                    let queueNameEnv = `${serviceType}_${appName}_${envName}_${serviceName}_QUEUE_NAME`.toUpperCase()
                    expect(deployContext.environmentVariables[queueNameEnv]).to.equal(queueName);
                    let queueUrlEnv = `${serviceType}_${appName}_${envName}_${serviceName}_QUEUE_URL`.toUpperCase()
                    expect(deployContext.environmentVariables[queueUrlEnv]).to.equal(queueUrl);
                    let queueArnEnv = `${serviceType}_${appName}_${envName}_${serviceName}_QUEUE_ARN`.toUpperCase()
                    expect(deployContext.environmentVariables[queueArnEnv]).to.equal(queueArn);

                    //Should have exported 1 policy
                    expect(deployContext.policies.length).to.equal(1); //Should have exported one policy
                    expect(deployContext.policies[0].Resource[0]).to.equal(queueArn);
                });
        });

        it('should update the stack when the queue already exists', function() {
            let getStackStub = sandbox.stub(cloudfFormationCalls, 'getStack').returns(Promise.resolve({}));
            let updateStackStub = sandbox.stub(cloudfFormationCalls, 'updateStack').returns(Promise.resolve({
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
                    }
                ]
            }));

            return sqs.deploy(ownServiceContext, ownPreDeployContext, [])
                .then(deployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(updateStackStub.calledOnce).to.be.true;

                    expect(deployContext).to.be.instanceof(DeployContext);

                    //Should have exported 3 env vars
                    let queueNameEnv = `${serviceType}_${appName}_${envName}_${serviceName}_QUEUE_NAME`.toUpperCase()
                    expect(deployContext.environmentVariables[queueNameEnv]).to.equal(queueName);
                    let queueUrlEnv = `${serviceType}_${appName}_${envName}_${serviceName}_QUEUE_URL`.toUpperCase()
                    expect(deployContext.environmentVariables[queueUrlEnv]).to.equal(queueUrl);
                    let queueArnEnv = `${serviceType}_${appName}_${envName}_${serviceName}_QUEUE_ARN`.toUpperCase()
                    expect(deployContext.environmentVariables[queueArnEnv]).to.equal(queueArn);

                    //Should have exported 1 policy
                    expect(deployContext.policies.length).to.equal(1); //Should have exported one policy
                    expect(deployContext.policies[0].Resource[0]).to.equal(queueArn);
                });
        });
    });

    describe('consumeEvents', function() {
        it('should throw an error because SQS cant consume event services', function() {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let consumerServiceContext = new ServiceContext(appName, envName, "ConsumerService", "sqs", deployVersion, {});
            let consumerDeployContext = new DeployContext(consumerServiceContext);
            consumerDeployContext.eventOutputs.queueUrl = "FakeQueueUrl";
            consumerDeployContext.eventOutputs.queueArn = "FakeQueueArn";

            let producerServiceContext = new ServiceContext(appName, envName, "ProducerService", "sns", deployVersion, {});
            let producerDeployContext = new DeployContext(producerServiceContext);
            producerDeployContext.eventOutputs.topicArn = "FakeTopicArn";

            let addSqsPermissionStub = sandbox.stub(sqsCalls, 'addSqsPermissionIfNotExists').returns(Promise.resolve({}));

            return sqs.consumeEvents(consumerServiceContext, consumerDeployContext, producerServiceContext, producerDeployContext)
                .then(consumeEventsContext => {
                    expect(addSqsPermissionStub.calledOnce).to.be.true;
                    expect(consumeEventsContext).to.be.instanceOf(ConsumeEventsContext);
                });
        });
    });

    describe('produceEvents', function() {
        it('should throw an error because SQS cant produce events for other services', function() {
            return sqs.produceEvents(null, null, null, null)
                .then(produceEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("SQS service doesn't produce events");
                });
        });
    });

    describe('unPreDeploy', function() {
        it('should return an empty UnPreDeploy context', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "sqs", "1", {});
            return sqs.unPreDeploy(serviceContext)
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                });
        });
    });

    describe('unBind', function() {
        it('should return an empty UnBind context', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "sqs", "1", {});
            return sqs.unBind(serviceContext)
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                });
        });
    });

    describe('unDeploy', function() {
        it('should undeploy the stack', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "sqs", "1", {});
            let unDeployStackStub = sandbox.stub(deployersCommon, 'unDeployCloudFormationStack').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return sqs.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});