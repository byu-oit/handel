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
    DeployContext,
    PreDeployContext,
    ProduceEventsContext,
    ServiceContext,
    ServiceDeployer,
    ServiceEventType,
    ServiceType,
    UnDeployContext
} from 'handel-extension-api';
import { awsCalls, deployPhase } from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import { Service } from '../../../src/services/iot';
import { IotServiceConfig, IotServiceEventConsumer } from '../../../src/services/iot/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('iot deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    let serviceContext: ServiceContext<IotServiceConfig>;
    let serviceParams: IotServiceConfig;
    let iot: ServiceDeployer;

    beforeEach(async () => {
        iot = new Service();
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'iot',
            event_consumers: [{
                service_name: 'myconsumer',
                sql: 'select * from \'something\''
            }]
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'iot'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should return an error when the service_name param is not specified in event_consumers', () => {
            delete serviceContext.params.event_consumers[0].service_name;
            const errors = iot.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'service_name\' parameter is required');
        });

        it('should return an error when the sql parameter is not specified in the event_consumers seciton', () => {
            delete serviceContext.params.event_consumers[0].sql;
            const errors = iot.check!(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'sql\' parameter is required');
        });

        it('should return no errors when configured properly', () => {
            const errors = iot.check!(serviceContext, []);
            expect(errors.length).to.equal(0);
        });
    });

    describe('deploy', () => {
        it('should return an empty deploy context', async () => {
            const deployContext = await iot.deploy!(serviceContext, new PreDeployContext(serviceContext), []);
            expect(deployContext).to.be.instanceof(DeployContext);
        });
    });

    describe('produceEvents', () => {
        let ownDeployContext: DeployContext;
        let eventConsumerConfig: IotServiceEventConsumer;

        beforeEach(() => {
            serviceContext.params = {
                type: 'iot',
                event_consumers: [{
                    service_name: 'FakeConsumer',
                    sql: 'select * from something;',
                    rule_disabled: false
                }]
            };
            eventConsumerConfig = {
                service_name: 'FakeConsumer',
                sql: 'FakeSql'
            };

            ownDeployContext = new DeployContext(serviceContext);
            ownDeployContext.eventOutputs = {
                resourceArn: 'FakeArn',
                resourcePrincipal: 'FakePrincipal',
                serviceEventType: ServiceEventType.IoT
            };
        });

        it('should create topic rules when lambda is the event consumer', async () => {
            const consumerServiceContext = new ServiceContext(appName, envName, 'FakeConsumer', new ServiceType(STDLIB_PREFIX, 'lambda'), {type: 'lambda'}, accountConfig);
            const consumerDeployContext = new DeployContext(consumerServiceContext);
            consumerDeployContext.eventOutputs = {
                resourceArn: 'FakeArn',
                resourcePrincipal: 'FakePrincipal',
                serviceEventType: ServiceEventType.Lambda
            };

            const deployStackStub = sandbox.stub(deployPhase, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [
                    {
                        OutputKey: 'TopicRuleName',
                        OutputValue: 'MyRuleName',
                    }
                ]
            }));

            const produceEventsContext = await iot.produceEvents!(serviceContext, ownDeployContext, eventConsumerConfig, consumerServiceContext, consumerDeployContext);
            expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
            expect(deployStackStub.callCount).to.equal(1);
        });
    });

    describe('unDeploy', () => {
        it('should delete the topic rule stacks', async () => {
            serviceContext.params = {
                type: 'iot',
                event_consumers: [
                    {
                        service_name: 'A',
                        sql: 'fake'
                    },
                    {
                        service_name: 'B',
                        sql: 'fake'
                    }
                ]
            };

            const getStackStub = sandbox.stub(awsCalls.cloudFormation, 'getStack').returns(Promise.resolve({}));
            const deleteStackStub = sandbox.stub(awsCalls.cloudFormation, 'deleteStack').returns(Promise.resolve({}));

            const unDeployContext = await iot.unDeploy!(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(getStackStub.callCount).to.equal(2);
            expect(deleteStackStub.callCount).to.equal(2);
        });
    });
});
