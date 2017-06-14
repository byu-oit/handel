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
const cloudWatchEvent = require('../../../lib/services/cloudwatchevent');
const cloudWatchEventsCalls = require('../../../lib/aws/cloudwatch-events-calls');
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const ServiceContext = require('../../../lib/datatypes/service-context');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const preDeployPhaseCommon = require('../../../lib/common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../../lib/common/bind-phase-common');
const ProduceEventsContext = require('../../../lib/datatypes/produce-events-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const UnBindContext = require('../../../lib/datatypes/un-bind-context');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('cloudwatchevent deployer', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require the schedule or event_pattern parameter to be present', function () {
            let serviceContext = {
                params: {}
            }
            let errors = cloudWatchEvent.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("You must specify at least one of the 'schedule' or 'event_pattern' parameters");
        });

        it('should work when there are no configuration errors', function () {
            let serviceContext = {
                params: {
                    schedule: 'rate(1 minute)'
                }
            }
            let errors = cloudWatchEvent.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('preDeploy', function () {
        it('should return an empty predeploy context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let preDeployNotRequiredStub = sandbox.stub(preDeployPhaseCommon, 'preDeployNotRequired').returns(Promise.resolve(new PreDeployContext(serviceContext)));

            return cloudWatchEvent.preDeploy(serviceContext)
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
            
            return cloudWatchEvent.bind(serviceContext)
                .then(bindContext => {
                    expect(bindNotRequiredStub.callCount).to.equal(1);
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('deploy', function () {
        let appName = "FakeApp";
        let envName = "FakeEnv";
        let deployVersion = "1";
        let serviceContext = new ServiceContext(appName, envName, "FakeService", "cloudwatchevent", deployVersion, {
            schedule: 'rate(1 minute)'
        });
        let preDeployContext = new PreDeployContext(serviceContext);
        let eventRuleArn = "FakeEventRuleArn";

        it('should deploy the event rule', function () {
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'EventRuleArn',
                    OutputValue: eventRuleArn
                }]                
            }));

            return cloudWatchEvent.deploy(serviceContext, preDeployContext, [])
                .then(deployContext => {
                    expect(deployStackStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.eventOutputs.principal).to.equal("events.amazonaws.com");
                    expect(deployContext.eventOutputs.eventRuleArn).to.equal(eventRuleArn);
                });
        });
    });

    describe('consumeEvents', function () {
        it('should return an error since it cant consume events', function () {
            return cloudWatchEvent.consumeEvents(null, null, null, null)
                .then(() => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("CloudWatch Events service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function () {
        let appName = "FakeApp";
        let envName = "FakeEnv";
        let deployVersion = "1";

        it('should add a target for the lambda service type', function () {
            let consumerServiceName = "ConsumerService";
            let consumerServiceContext = new ServiceContext(appName, envName, consumerServiceName, "lambda", deployVersion, {});
            let consumerDeployContext = new DeployContext(consumerServiceContext);
            consumerDeployContext.lambdaArn = "FakeLambdaArn";

            let producerServiceContext = new ServiceContext(appName, envName, "ProducerService", "cloudwatchevent", deployVersion, {
                event_consumers: [
                    {
                        service_name: consumerServiceName,
                        input: '{"notify": false}'
                    }
                ]
            });
            let producerDeployContext = new DeployContext(producerServiceContext);

            let addTargetStub = sandbox.stub(cloudWatchEventsCalls, 'addTarget').returns(Promise.resolve("FakeTargetId"));

            return cloudWatchEvent.produceEvents(producerServiceContext, producerDeployContext, consumerServiceContext, consumerDeployContext)
                .then(produceEventsContext => {
                    expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
                    expect(addTargetStub.calledOnce).to.be.truel
                });
        });

        it('should throw an error for an unsupported consumer service type', function () {
            let consumerServiceName = "ConsumerService";
            let consumerServiceContext = new ServiceContext(appName, envName, consumerServiceName, "dynamodb", deployVersion, {});
            let consumerDeployContext = new DeployContext(consumerServiceContext);

            let producerServiceContext = new ServiceContext(appName, envName, "ProducerService", "cloudwatchevent", deployVersion, {
                event_consumers: [
                    {
                        service_name: consumerServiceName
                    }
                ]
            });
            let producerDeployContext = new DeployContext(producerServiceContext);

            let addTargetStub = sandbox.stub(cloudWatchEventsCalls, 'addTarget').returns(Promise.resolve("FakeTargetId"));

            return cloudWatchEvent.produceEvents(producerServiceContext, producerDeployContext, consumerServiceContext, consumerDeployContext)
                .then(produceEventsContext => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Unsupported event consumer type");
                    expect(addTargetStub.notCalled).to.be.true;
                });
        });
    });

    describe('unPreDeploy', function () {
        it('should return an empty UnPreDeploy context', function () {
            let unPreDeployNotRequiredStub = sandbox.stub(deletePhasesCommon, 'unPreDeployNotRequired').returns(Promise.resolve(new UnPreDeployContext({})));
            return cloudWatchEvent.unPreDeploy({})
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeployNotRequiredStub.callCount).to.equal(1);
                });
        });
    });

    describe('unBind', function () {
        it('should return an empty UnBind context', function () {
            let unBindNotRequiredStub = sandbox.stub(deletePhasesCommon, 'unBindNotRequired').returns(Promise.resolve(new UnBindContext({})));
            return cloudWatchEvent.unBind({})
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                    expect(unBindNotRequiredStub.callCount).to.equal(1);
                });
        });
    });

    describe('unDeploy', function () {
        it('should remove all targets and delete the stack', function () {
            let getRuleStub = sandbox.stub(cloudWatchEventsCalls, 'getRule').returns(Promise.resolve({}));
            let removeTargetsStub = sandbox.stub(cloudWatchEventsCalls, 'removeAllTargets').returns(Promise.resolve(true));
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployCloudFormationStack').returns(Promise.resolve(true));
            
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "cloudwatchevent", "1", {});
            return cloudWatchEvent.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(getRuleStub.calledOnce).to.be.true;
                    expect(removeTargetsStub.calledOnce).to.be.true;
                    expect(unDeployStackStub.calledOnce).to.be.true;
                });
        });
    });
});