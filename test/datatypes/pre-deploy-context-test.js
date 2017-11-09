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
const PreDeployContext = require('../../dist/datatypes/pre-deploy-context').PreDeployContext;
const expect = require('chai').expect;

describe('PreDeployContext', function () {
    it('should be able to be constructed from a ServiceContext', function () {
        let serviceContext = {
            appName: 'appName',
            environmentName: 'environmentName',
            serviceName: 'serviceName',
            serviceType: 'serviceType'
        };
        let preDeployContext = new PreDeployContext(serviceContext);
        expect(preDeployContext.appName).to.equal(serviceContext.appName);
        expect(preDeployContext.environmentName).to.equal(serviceContext.environmentName);
        expect(preDeployContext.serviceName).to.equal(serviceContext.serviceName);
        expect(preDeployContext.serviceType).to.equal(serviceContext.serviceType);
        expect(preDeployContext.securityGroups).to.deep.equal([]);
    });
});