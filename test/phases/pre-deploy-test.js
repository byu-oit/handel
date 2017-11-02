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
const preDeployPhase = require('../../dist/phases/pre-deploy');
const EnvironmentContext = require('../../dist/datatypes/environment-context');
const ServiceContext = require('../../dist/datatypes/service-context');
const PreDeployContext = require('../../dist/datatypes/pre-deploy-context');
const expect = require('chai').expect;

describe('preDeploy', function () {
    describe('preDeployServices', function () {
        //Create EnvironmentContext
        let appName = "test";
        let environmentName = "dev";
        let accountConfig = {};
        let environmentContext = new EnvironmentContext(appName, environmentName, accountConfig);


        //Construct ServiceContext B
        let serviceNameB = "B";
        let serviceTypeB = "efs"
        let paramsB = {
            other: "param"
        }
        let serviceContextB = new ServiceContext(appName, environmentName, serviceNameB, serviceTypeB, paramsB, accountConfig);
        environmentContext.serviceContexts[serviceNameB] = serviceContextB;

        //Construct ServiceContext A
        let serviceNameA = "A";
        let serviceTypeA = "ecs";
        let paramsA = {
            some: "param",
            dependencies: [serviceNameB]
        }
        let serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, serviceTypeA, paramsA, accountConfig);
        environmentContext.serviceContexts[serviceNameA] = serviceContextA;

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

            return preDeployPhase.preDeployServices(serviceDeployers, environmentContext)
                .then(preDeployContexts => {
                    expect(preDeployContexts[serviceNameA]).to.be.instanceof(PreDeployContext);
                    expect(preDeployContexts[serviceNameB]).to.be.instanceof(PreDeployContext);
                });
        });

        it('should return empty preDeployContexts for services that dont implement preDeploy', function() {
            let serviceDeployers = {
                efs: {
                    preDeploy: function (serviceContext) {
                        return Promise.resolve(new PreDeployContext(serviceContext));
                    }
                },
                ecs: {
                    //We're pretending here that ECS doesn't implement predeploy for the purposes of this test, even though it really does
                }
            }

            return preDeployPhase.preDeployServices(serviceDeployers, environmentContext)
                .then(preDeployContexts => {
                    expect(preDeployContexts[serviceNameA]).to.be.instanceof(PreDeployContext);
                    expect(preDeployContexts[serviceNameB]).to.be.instanceof(PreDeployContext);
                });
        });
    });
});