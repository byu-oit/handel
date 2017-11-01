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
const UnPreDeployContext = require('../../dist/datatypes/un-pre-deploy-context');

describe('UnDeployContext', function () {
    it('should be able to be constructed from a ServiceContext', function () {
        let serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', '1', {});
        let unPreDeployContext = new UnPreDeployContext(serviceContext);
        expect(unPreDeployContext.appName).to.equal(serviceContext.appName);
        expect(unPreDeployContext.environmentName).to.equal(serviceContext.environmentName);
        expect(unPreDeployContext.serviceName).to.equal(serviceContext.serviceName);
        expect(unPreDeployContext.serviceType).to.equal(serviceContext.serviceType);
    });
});