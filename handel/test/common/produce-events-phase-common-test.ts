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
import 'mocha';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import * as produceEventsPhaseCommon from '../../src/common/produce-events-phase-common';
import { AccountConfig, ServiceConfig, ServiceContext } from '../../src/datatypes';

describe('produce events phase common module', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getEventConsumerConfigParams', () => {
        const appName = 'FakeApp';
        const envName = 'FakeEnv';
        const consumerServiceName = 'ConsumerServiceName';
        const producerServiceName = 'ProducerServiceName';

        it('should return the config for the consumer from the producer', () => {
            const producerServiceContext = new ServiceContext(appName, envName, producerServiceName, 'cloudwatchevent', {
                type: 'cloudwatchevent',
                event_consumers: [{
                    service_name: consumerServiceName,
                }]
            }, accountConfig);

            const eventConsumerConfig = produceEventsPhaseCommon.getEventConsumerConfig(producerServiceContext, consumerServiceName);
            expect(eventConsumerConfig).to.not.equal(null);
            expect(eventConsumerConfig!.service_name).to.equal(consumerServiceName);
        });

        it('should return null when no config exists in the producer for the consumer', () => {
            const producerServiceContext = new ServiceContext(appName, envName, producerServiceName, 'cloudwatchevent', {
                type: 'cloudwatchevent'
            }, accountConfig);

            const eventConsumerConfig = produceEventsPhaseCommon.getEventConsumerConfig(producerServiceContext, consumerServiceName);
            expect(eventConsumerConfig).to.equal(null);
        });
    });
});
