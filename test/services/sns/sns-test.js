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
const sns = require('../../../lib/services/sns');
const snsCalls = require('../../../lib/aws/sns-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const ProduceEventsContext = require('../../../lib/datatypes/produce-events-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const bindPhaseCommon = require('../../../lib/common/bind-phase-common');
const preDeployPhaseCommon = require('../../../lib/common/pre-deploy-phase-common');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const UnBindContext = require('../../../lib/datatypes/un-bind-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('sns deployer', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should handle no subscriptions', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let errors = sns.check(serviceContext);
            expect(errors).to.deep.equal([]);
        });
        it('should require an endpoint on a subscription', function () {
            let params = {
                subscriptions: [{
                    protocol: 'http'
                }]
            };
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", params);
            let errors = sns.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`requires an 'endpoint'`);
        });
        it('should require a protocol on a subscription', function () {
            let params = {
                subscriptions: [{
                    endpoint: 'http://example.com/'
                }]
            };
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", params);
            let errors = sns.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`requires a 'protocol'`);
        });
        it('should require a valid protocol', function () {
            let params = {
                subscriptions: [{
                    endpoint: 'http://example.com/',
                    protocol: 'webhook'
                }]
            };
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", params);
            let errors = sns.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`Protocol must be one of`);
        });
    });

    describe('preDeploy', function () {
        it('should return an empty predeploy context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let preDeployNotRequiredStub = sandbox.stub(preDeployPhaseCommon, 'preDeployNotRequired').returns(Promise.resolve(new PreDeployContext(serviceContext)));

            return sns.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployNotRequiredStub.callCount).to.equal(1);
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                });
        });
    });

    describe('bind', function () {
        it('should return an empty bind context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let bindNotRequiredStub = sandbox.stub(bindPhaseCommon, 'bindNotRequired').returns(Promise.resolve(new BindContext({}, {})));

            return sns.bind(serviceContext)
                .then(bindContext => {
                    expect(bindNotRequiredStub.callCount).to.equal(1);
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('deploy', function () {
        let appName = "FakeApp";
        let envName = "FakeEnv";
        let serviceName = "FakeService";
        let serviceType = "sns";
        let topicName = "FakeTopic";
        let topicArn = "FakeArn";

        let ownServiceContext = new ServiceContext(appName, envName, serviceName, serviceType, "1", {
            type: 'sns'
        });
        let ownPreDeployContext = new PreDeployContext(ownServiceContext);

        it('should deploy the topic', function () {
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
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

            return sns.deploy(ownServiceContext, ownPreDeployContext, [])
                .then(deployContext => {
                    expect(deployStackStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);

                    //Should have exported 2 env vars
                    let topicNameEnv = `${serviceType}_${appName}_${envName}_${serviceName}_TOPIC_NAME`.toUpperCase()
                    expect(deployContext.environmentVariables[topicNameEnv]).to.equal(topicName);
                    let topicArnEnv = `${serviceType}_${appName}_${envName}_${serviceName}_TOPIC_ARN`.toUpperCase()
                    expect(deployContext.environmentVariables[topicArnEnv]).to.equal(topicArn);

                    //Should have exported 1 policy
                    expect(deployContext.policies.length).to.equal(1); //Should have exported one policy
                    expect(deployContext.policies[0].Resource[0]).to.equal(topicArn);
                });
        });
    });

    describe('consumeEvents', function () {
        it('should throw an error because SNS cant consume event services', function () {
            return sns.consumeEvents(null, null, null, null)
                .then(consumeEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("SNS service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function () {
        it('should subscribe the service to the topic when a lambda is given', function () {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let ownServiceContext = new ServiceContext(appName, envName, "consumerService", "sns", deployVersion, {});
            let ownDeployContext = new DeployContext(ownServiceContext);
            ownDeployContext.eventOutputs.topicArn = "FakeTopicArn";

            let consumerServiceContext = new ServiceContext(appName, envName, "producerService", "lambda", deployVersion, {});
            let consumerDeployContext = new DeployContext(consumerServiceContext);
            consumerDeployContext.eventOutputs.lambdaArn = "FakeLambdaArn";

            let subscribeToTopicStub = sandbox.stub(snsCalls, 'subscribeToTopic').returns(Promise.resolve({}));

            return sns.produceEvents(ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext)
                .then(produceEventsContext => {
                    expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
                    expect(subscribeToTopicStub.calledOnce).to.be.true;
                });
        });

        it('should return an error for any other service type', function () {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let ownServiceContext = new ServiceContext(appName, envName, "consumerService", "sns", deployVersion, {});
            let ownDeployContext = new DeployContext(ownServiceContext);
            ownDeployContext.eventOutputs.topicArn = "FakeTopicArn";

            let consumerServiceContext = new ServiceContext(appName, envName, "producerService", "efs", deployVersion, {});
            let consumerDeployContext = new DeployContext(consumerServiceContext);

            let subscribeToTopicStub = sandbox.stub(snsCalls, 'subscribeToTopic').returns(Promise.resolve({}));

            return sns.produceEvents(ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext)
                .then(produceEventsContext => {
                    expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
                    expect(true).to.equal(false);
                })
                .catch(err => {
                    expect(err.message).to.contain('Unsupported event consumer type given');
                    expect(subscribeToTopicStub.notCalled).to.be.true;
                })
        });
    });

    describe('unPreDeploy', function () {
        it('should return an empty UnPreDeploy context', function () {
            let unPreDeployNotRequiredStub = sandbox.stub(deletePhasesCommon, 'unPreDeployNotRequired').returns(Promise.resolve(new UnPreDeployContext({})));
            return sns.unPreDeploy({})
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeployNotRequiredStub.callCount).to.equal(1);
                });
        });
    });

    describe('unBind', function () {
        it('should return an empty UnBind context', function () {
            let unBindNotRequiredStub = sandbox.stub(deletePhasesCommon, 'unBindNotRequired').returns(Promise.resolve(new UnBindContext({})));
            return sns.unBind({})
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                    expect(unBindNotRequiredStub.callCount).to.equal(1);
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "sns", "1", {});
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployCloudFormationStack').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return sns.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});