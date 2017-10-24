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
const unPreDeployPhase = require('../../lib/phases/un-pre-deploy');
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const ServiceContext = require('../../lib/datatypes/service-context');
const UnPreDeployContext = require('../../lib/datatypes/un-pre-deploy-context');
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

        it('should execute unpredeploy on all services, even across levels', function () {
            let serviceDeployers = {
                efs: {
                    unPreDeploy: function (serviceContext) {
                        return Promise.resolve(new UnPreDeployContext(serviceContext));
                    }
                },
                ecs: {
                    unPreDeploy: function (serviceContext) {
                        return Promise.resolve(new UnPreDeployContext(serviceContext));
                    }
                }
            }

            return unPreDeployPhase.unPreDeployServices(serviceDeployers, environmentContext)
                .then(unPreDeployContexts => {
                    expect(unPreDeployContexts[serviceNameA]).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeployContexts[serviceNameB]).to.be.instanceof(UnPreDeployContext);
                });
        });

        it('should return empty unpredeploy contexts for deployers that dont implement unpredeploy', function() {
            let serviceDeployers = {
                efs: {
                    unPreDeploy: function (serviceContext) {
                        return Promise.resolve(new UnPreDeployContext(serviceContext));
                    }
                },
                ecs: {
                    //Simulating that ECS doesn't implement unpredeploy
                }
            }

            return unPreDeployPhase.unPreDeployServices(serviceDeployers, environmentContext)
                .then(unPreDeployContexts => {
                    expect(unPreDeployContexts[serviceNameA]).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeployContexts[serviceNameB]).to.be.instanceof(UnPreDeployContext);
                });
        });
    });
});