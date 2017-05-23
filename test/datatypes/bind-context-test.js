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
const BindContext = require('../../lib/datatypes/bind-context');

describe('BindContet', function () {
    it('should be able to be constructed from a ServiceContext', function () {
        let dependencyServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', '1', {});
        let dependentOfServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService2', 'FakeType2', '1', {});
        let bindContext = new BindContext(dependencyServiceContext, dependentOfServiceContext);
        expect(bindContext.dependencyServiceContext.appName).to.equal(dependencyServiceContext.appName);
        expect(bindContext.dependencyServiceContext.environmentName).to.equal(dependencyServiceContext.environmentName);
        expect(bindContext.dependencyServiceContext.serviceName).to.equal(dependencyServiceContext.serviceName);
        expect(bindContext.dependencyServiceContext.serviceType).to.equal(dependencyServiceContext.serviceType);
        expect(bindContext.dependentOfServiceContext.appName).to.equal(dependentOfServiceContext.appName);
        expect(bindContext.dependentOfServiceContext.environmentName).to.equal(dependentOfServiceContext.environmentName);
        expect(bindContext.dependentOfServiceContext.serviceName).to.equal(dependentOfServiceContext.serviceName);
        expect(bindContext.dependentOfServiceContext.serviceType).to.equal(dependentOfServiceContext.serviceType);
    });
})