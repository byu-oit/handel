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
const expect = require('chai').expect;
const ServiceContext = require('../../dist/datatypes/service-context');
const ProduceEventsContext = require('../../dist/datatypes/produce-events-context');

describe('ProduceEventsContext', function () {
    it('should be able to be constructed from a ServiceContext', function () {
        let producingServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService2', 'FakeType2', '1', {});
        let consumingServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', '1', {});
        let consumeContext = new ProduceEventsContext(producingServiceContext, consumingServiceContext);
        expect(consumeContext.producingServiceContext.appName).to.equal(producingServiceContext.appName);
        expect(consumeContext.producingServiceContext.environmentName).to.equal(producingServiceContext.environmentName);
        expect(consumeContext.producingServiceContext.serviceName).to.equal(producingServiceContext.serviceName);
        expect(consumeContext.producingServiceContext.serviceType).to.equal(producingServiceContext.serviceType);
        expect(consumeContext.consumingServiceContext.appName).to.equal(consumingServiceContext.appName);
        expect(consumeContext.consumingServiceContext.environmentName).to.equal(consumingServiceContext.environmentName);
        expect(consumeContext.consumingServiceContext.serviceName).to.equal(consumingServiceContext.serviceName);
        expect(consumeContext.consumingServiceContext.serviceType).to.equal(consumingServiceContext.serviceType);
    });
})