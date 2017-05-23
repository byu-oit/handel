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
const DeployContext = require('../../lib/datatypes/deploy-context');
const expect = require('chai').expect;

describe("DeployContext", function () {
    it('should be able to be constructed from a ServiceContext', function () {
        let serviceContext = {
            appName: 'appName',
            environmentName: 'environmentName',
            serviceName: 'serviceName',
            serviceType: 'serviceType'
        }
        let deployContext = new DeployContext(serviceContext);
        expect(deployContext.appName).to.equal(serviceContext.appName);
        expect(deployContext.environmentName).to.equal(serviceContext.environmentName);
        expect(deployContext.serviceName).to.equal(serviceContext.serviceName);
        expect(deployContext.serviceType).to.equal(serviceContext.serviceType);
        expect(deployContext.eventOutputs).to.deep.equal({});
        expect(deployContext.policies).to.deep.equal([]);
        expect(deployContext.credentials).to.deep.equal([]);
        expect(deployContext.environmentVariables).to.deep.equal({});
        expect(deployContext.scripts).to.deep.equal([]);
    });
});