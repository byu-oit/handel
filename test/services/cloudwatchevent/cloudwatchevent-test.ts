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
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as cloudWatchEventsCalls from '../../../src/aws/cloudwatch-events-calls';
import * as deletePhasesCommon from '../../../src/common/delete-phases-common';
import * as deployPhaseCommon from '../../../src/common/deploy-phase-common';
import { AccountConfig, DeployContext, PreDeployContext, ProduceEventsContext, ServiceContext, UnDeployContext } from '../../../src/datatypes';
import * as cloudWatchEvent from '../../../src/services/cloudwatchevent';
import { CloudWatchEventsConfig } from '../../../src/services/cloudwatchevent/config-types';

describe('cloudwatchevent deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<CloudWatchEventsConfig>;
    let serviceParams: CloudWatchEventsConfig;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'cloudwatchevents'
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', 'cloudwatchevent', serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should require the schedule or event_pattern parameter to be present', () => {
            const errors = cloudWatchEvent.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('You must specify at least one of the \'schedule\' or \'event_pattern\' parameters');
        });

        it('should work when there are no configuration errors', () => {
            serviceContext.params = {
                type: 'cloudwatchevents',
                schedule: 'rate(1 minute)'
            };
            const errors = cloudWatchEvent.check(serviceContext, []);
            expect(errors.length).to.equal(0);
        });
    });

    describe('deploy', () => {
        it('should deploy the event rule', async () => {
            serviceContext.params = {
                type: 'cloudwatchevents',
                schedule: 'rate(1 minute)'
            };
            const preDeployContext = new PreDeployContext(serviceContext);
            const eventRuleArn = 'FakeEventRuleArn';

            const deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'EventRuleArn',
                    OutputValue: eventRuleArn
                }]
            }));

            const deployContext = await cloudWatchEvent.deploy(serviceContext, preDeployContext, []);
            expect(deployStackStub.callCount).to.equal(1);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.eventOutputs.principal).to.equal('events.amazonaws.com');
            expect(deployContext.eventOutputs.eventRuleArn).to.equal(eventRuleArn);
        });
    });

    describe('produceEvents', () => {
        it('should add a target for the lambda service type', async () => {
            const consumerServiceName = 'ConsumerService';
            const consumerServiceContext = new ServiceContext(appName, envName, consumerServiceName, 'lambda', {type: 'lambda'}, accountConfig);
            const consumerDeployContext = new DeployContext(consumerServiceContext);
            consumerDeployContext.eventOutputs.lambdaArn = 'FakeLambdaArn';

            serviceContext.params = {
                type: 'cloudwatchevents',
                event_consumers: [
                    {
                        service_name: consumerServiceName,
                        event_input: '{"notify": false}'
                    }
                ]
            };
            const producerDeployContext = new DeployContext(serviceContext);

            const addTargetStub = sandbox.stub(cloudWatchEventsCalls, 'addTarget').returns(Promise.resolve('FakeTargetId'));

            const produceEventsContext = await cloudWatchEvent.produceEvents(serviceContext, producerDeployContext, consumerServiceContext, consumerDeployContext);
            expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
            expect(addTargetStub.callCount).to.equal(1);
        });

        it('should add a target for the sns service type', async () => {
            const consumerServiceName = 'ConsumerService';
            const consumerServiceContext = new ServiceContext(appName, envName, consumerServiceName, 'sns', {type: 'sns'}, accountConfig);
            const consumerDeployContext = new DeployContext(consumerServiceContext);
            consumerDeployContext.eventOutputs.topicARN = 'FakeTopicArn';

            serviceContext.params = {
                type: 'cloudwatchevents',
                event_consumers: [
                    {
                        service_name: consumerServiceName,
                        event_input: '{"notify": false}'
                    }
                ]
            };
            const producerDeployContext = new DeployContext(serviceContext);

            const addTargetStub = sandbox.stub(cloudWatchEventsCalls, 'addTarget').returns(Promise.resolve('FakeTargetId'));

            const produceEventsContext = await cloudWatchEvent.produceEvents(serviceContext, producerDeployContext, consumerServiceContext, consumerDeployContext);
            expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
            expect(addTargetStub.callCount).to.equal(1);
        });

        it('should throw an error for an unsupported consumer service type', async () => {
            const consumerServiceName = 'ConsumerService';
            const consumerServiceContext = new ServiceContext(appName, envName, consumerServiceName, 'dynamodb', {type: 'dynamodb'}, accountConfig);
            const consumerDeployContext = new DeployContext(consumerServiceContext);

            serviceContext.params = {
                type: 'cloudwatchevents',
                event_consumers: [
                    {
                        service_name: consumerServiceName,
                        event_input: '{"notify": false}'
                    }
                ]
            };
            const producerDeployContext = new DeployContext(serviceContext);

            const addTargetStub = sandbox.stub(cloudWatchEventsCalls, 'addTarget').returns(Promise.resolve('FakeTargetId'));

            try {
                const produceEventsContext = await cloudWatchEvent.produceEvents(serviceContext, producerDeployContext, consumerServiceContext, consumerDeployContext);
                expect(true).to.equal(false); // Should not get here
            }
            catch (err) {
                expect(err.message).to.contain('Unsupported event consumer type');
                expect(addTargetStub.callCount).to.equal(0);
            }
        });
    });

    describe('unDeploy', () => {
        it('should remove all targets and delete the stack', async () => {
            const getRuleStub = sandbox.stub(cloudWatchEventsCalls, 'getRule').returns(Promise.resolve({}));
            const removeTargetsStub = sandbox.stub(cloudWatchEventsCalls, 'removeAllTargets').returns(Promise.resolve(true));
            const unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(true));

            const unDeployContext = await cloudWatchEvent.unDeploy(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(getRuleStub.callCount).to.equal(1);
            expect(removeTargetsStub.callCount).to.equal(1);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
