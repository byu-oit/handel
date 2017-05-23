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
const ServiceContext = require('../../lib/datatypes/service-context');
const UnBindContext = require('../../lib/datatypes/un-bind-context');

describe('UnBindContext', function() {
    it('should be able to be constructed from a ServiceContext', function() {
        let serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', '1', {});
        let unBindContext = new UnBindContext(serviceContext);
        expect(unBindContext.appName).to.equal(serviceContext.appName);
        expect(unBindContext.environmentName).to.equal(serviceContext.environmentName);
        expect(unBindContext.serviceName).to.equal(serviceContext.serviceName);
        expect(unBindContext.serviceType).to.equal(serviceContext.serviceType);
    });
});