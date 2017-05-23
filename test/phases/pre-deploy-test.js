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
const accountConfig = require('../../lib/common/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const preDeployPhase = require('../../lib/phases/pre-deploy');
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const ServiceContext = require('../../lib/datatypes/service-context');
const PreDeployContext = require('../../lib/datatypes/pre-deploy-context');
const expect = require('chai').expect;

describe('preDeploy', function () {
    describe('preDeployServices', function () {
        it('should execute predeploy on all services, even across levels', function () {
            let serviceDeployers = {
                efs: {
                    preDeploy: function (serviceContext) {
                        return Promise.resolve(new PreDeployContext(serviceContext));
                    }
                },
                ecs: {
                    preDeploy: function (serviceContext) {
                        return Promise.resolve(new PreDeployContext(serviceContext));
                    }
                }
            }

            //Create EnvironmentContext
            let appName = "test";
            let deployVersion = "1";
            let environmentName = "dev";
            let environmentContext = new EnvironmentContext(appName, deployVersion, environmentName);


            //Construct ServiceContext B
            let serviceNameB = "B";
            let serviceTypeB = "efs"
            let paramsB = {
                other: "param"
            }
            let serviceContextB = new ServiceContext(appName, environmentName, serviceNameB, serviceTypeB, deployVersion, paramsB);
            environmentContext.serviceContexts[serviceNameB] = serviceContextB;

            //Construct ServiceContext A
            let serviceNameA = "A";
            let serviceTypeA = "ecs";
            let paramsA = {
                some: "param",
                dependencies: [serviceNameB]
            }
            let serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, serviceTypeA, deployVersion, paramsA);
            environmentContext.serviceContexts[serviceNameA] = serviceContextA;

            return preDeployPhase.preDeployServices(serviceDeployers, environmentContext)
                .then(preDeployContexts => {
                    expect(preDeployContexts[serviceNameA]).to.be.instanceof(PreDeployContext);
                    expect(preDeployContexts[serviceNameB]).to.be.instanceof(PreDeployContext);
                });
        });
    });
});