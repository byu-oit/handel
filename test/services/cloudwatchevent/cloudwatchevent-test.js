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
const cloudWatchEvent = require('../../../dist/services/cloudwatchevent');
const cloudWatchEventsCalls = require('../../../dist/aws/cloudwatch-events-calls');
const deployPhaseCommon = require('../../../dist/common/deploy-phase-common');
const ServiceContext = require('../../../dist/datatypes/service-context');
const deletePhasesCommon = require('../../../dist/common/delete-phases-common');
const ProduceEventsContext = require('../../../dist/datatypes/produce-events-context');
const DeployContext = require('../../../dist/datatypes/deploy-context');
const UnDeployContext = require('../../../dist/datatypes/un-deploy-context');
const PreDeployContext = require('../../../dist/datatypes/pre-deploy-context');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../../dist/account-config/account-config');

describe('cloudwatchevent deployer', function () {
    let sandbox;
    let serviceContext;
    let appName = "FakeApp";
    let envName = "FakeEnv";
    beforeEach(function () {
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext(appName, envName, "FakeService", "cloudwatchevent", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require the schedule or event_pattern parameter to be present', function () {
            let errors = cloudWatchEvent.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("You must specify at least one of the 'schedule' or 'event_pattern' parameters");
        });

        it('should work when there are no configuration errors', function () {
            serviceContext.params = {
                schedule: 'rate(1 minute)'
            }
            let errors = cloudWatchEvent.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('deploy', function () {
        it('should deploy the event rule', function () {
            serviceContext.params = {
                schedule: 'rate(1 minute)'
            }
            let preDeployContext = new PreDeployContext(serviceContext);
            let eventRuleArn = "FakeEventRuleArn";

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

    describe('produceEvents', function () {
        it('should add a target for the lambda service type', function () {
            let consumerServiceName = "ConsumerService";
            let consumerServiceContext = new ServiceContext(appName, envName, consumerServiceName, "lambda", {}, {});
            let consumerDeployContext = new DeployContext(consumerServiceContext);
            consumerDeployContext.lambdaArn = "FakeLambdaArn";

            serviceContext.params = {
                event_consumers: [
                    {
                        service_name: consumerServiceName,
                        input: '{"notify": false}'
                    }
                ]
            }
            let producerDeployContext = new DeployContext(serviceContext);

            let addTargetStub = sandbox.stub(cloudWatchEventsCalls, 'addTarget').returns(Promise.resolve("FakeTargetId"));

            return cloudWatchEvent.produceEvents(serviceContext, producerDeployContext, consumerServiceContext, consumerDeployContext)
                .then(produceEventsContext => {
                    expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
                    expect(addTargetStub.calledOnce).to.be.truel
                });
        });

        it('should throw an error for an unsupported consumer service type', function () {
            let consumerServiceName = "ConsumerService";
            let consumerServiceContext = new ServiceContext(appName, envName, consumerServiceName, "dynamodb", {}, {});
            let consumerDeployContext = new DeployContext(consumerServiceContext);

            serviceContext.params = {
                event_consumers: [
                    {
                        service_name: consumerServiceName
                    }
                ]
            }
            let producerDeployContext = new DeployContext(serviceContext);

            let addTargetStub = sandbox.stub(cloudWatchEventsCalls, 'addTarget').returns(Promise.resolve("FakeTargetId"));

            return cloudWatchEvent.produceEvents(serviceContext, producerDeployContext, consumerServiceContext, consumerDeployContext)
                .then(produceEventsContext => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Unsupported event consumer type");
                    expect(addTargetStub.notCalled).to.be.true;
                });
        });
    });

    describe('unDeploy', function () {
        it('should remove all targets and delete the stack', function () {
            let getRuleStub = sandbox.stub(cloudWatchEventsCalls, 'getRule').returns(Promise.resolve({}));
            let removeTargetsStub = sandbox.stub(cloudWatchEventsCalls, 'removeAllTargets').returns(Promise.resolve(true));
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(true));

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
