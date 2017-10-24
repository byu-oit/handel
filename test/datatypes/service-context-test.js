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
const expect = require('chai').expect;

describe('ServiceContext', function () {
    it('should be able to be constructed from required params', function () {
        let appName = "FakeApp";
        let environmentName = "FakeEnv";
        let serviceName = "FakeService";
        let serviceType = "FakeType";
        let params = {};
        let serviceContext = new ServiceContext(appName, environmentName, serviceName, serviceType, params);
        expect(serviceContext.appName).to.equal(appName);
        expect(serviceContext.environmentName).to.equal(environmentName);
        expect(serviceContext.serviceName).to.equal(serviceName);
        expect(serviceContext.serviceType).to.equal(serviceType);
        expect(serviceContext.params).to.deep.equal(params);
    });
});