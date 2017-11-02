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
const unDeployPhase = require('../../dist/phases/un-deploy');
const EnvironmentContext = require('../../dist/datatypes/environment-context');
const ServiceContext = require('../../dist/datatypes/service-context');
const UnDeployContext = require('../../dist/datatypes/un-deploy-context');
const expect = require('chai').expect;
const sinon = require('sinon');

describe('unDeploy', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('unDeployServicesInLevel', function () {
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

        //Set deploy order 
        let deployOrder = [
            [serviceNameB],
            [serviceNameA]
        ]
        let levelToUnDeploy = 1;

        it('should UnDeploy the services in the given level', function () {
            let serviceDeployers = {
                efs: {
                    unDeploy: function (toUnDeployServiceContext) {
                        throw new Error("Should not have called ECS in this level");
                    }
                },
                ecs: {
                    unDeploy: function (toUnDeployServiceContext) {
                        return Promise.resolve(new UnDeployContext(toUnDeployServiceContext));
                    }
                }
            }

            return unDeployPhase.unDeployServicesInLevel(serviceDeployers, environmentContext, deployOrder, levelToUnDeploy)
                .then(unDeployContexts => {
                    expect(unDeployContexts[serviceNameA]).to.be.instanceOf(UnDeployContext);
                });
        });

        it('should return emtpy undeploy contexts for services that dont implment undeploy', function() {
            let serviceDeployers = {
                efs: {
                    unDeploy: function (toUnDeployServiceContext) {
                        throw new Error("Should not have called ECS in this level");
                    }
                },
                ecs: {
                    //Simulating that ECS doesn't implement undeploy
                }
            }

            return unDeployPhase.unDeployServicesInLevel(serviceDeployers, environmentContext, deployOrder, levelToUnDeploy)
                .then(unDeployContexts => {
                    expect(unDeployContexts[serviceNameA]).to.be.instanceOf(UnDeployContext);
                });
        });
    });
});
