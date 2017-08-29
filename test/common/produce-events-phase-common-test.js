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
const ServiceContext = require('../../lib/datatypes/service-context');
const produceEventsPhaseCommon = require('../../lib/common/produce-events-phase-common');
const sinon = require('sinon');
const expect = require('chai').expect;

const accountConfig = require('../../lib/common/account-config')(`${__dirname}/../test-account-config.yml`);

describe('produce events phase common module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('getEventConsumerConfigParams', function () {
        let appName = "FakeApp";
        let envName = "FakeEnv";
        let deployVersion = "1";
        let consumerServiceName = "ConsumerServiceName";
        let producerServiceName = "ProducerServiceName";

        it('should return the config for the consumer from the producer', function () {
            let eventInputVal = '{"notify": false}';
            let producerServiceContext = new ServiceContext(appName, envName, producerServiceName, "cloudwatchevent", deployVersion, {
                event_consumers: [{
                    service_name: consumerServiceName,
                    event_input: eventInputVal
                }]
            });

            let eventConsumerConfig = produceEventsPhaseCommon.getEventConsumerConfig(producerServiceContext, consumerServiceName);
            expect(eventConsumerConfig).to.not.be.null;
            expect(eventConsumerConfig.event_input).to.equal(eventInputVal);
        });

        it('should return null when no config exists in the producer for the consumer', function () {
            let producerServiceContext = new ServiceContext(appName, envName, producerServiceName, "cloudwatchevent", deployVersion, {
                event_consumers: []
            });

            let eventConsumerConfig = produceEventsPhaseCommon.getEventConsumerConfig(producerServiceContext, consumerServiceName);
            expect(eventConsumerConfig).to.be.null;
        });
    });
});