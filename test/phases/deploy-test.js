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
const deployPhase = require('../../lib/phases/deploy');
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const ServiceContext = require('../../lib/datatypes/service-context');
const PreDeployContext = require('../../lib/datatypes/pre-deploy-context');
const DeployContext = require('../../lib/datatypes/deploy-context');
const expect = require('chai').expect;
const sinon = require('sinon');

describe('deploy', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('deployServicesInLevel', function () {
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

        //Construct PreDeployContexts
        let preDeployContexts = {}
        preDeployContexts[serviceNameA] = new PreDeployContext(serviceContextA);
        preDeployContexts[serviceNameB] = new PreDeployContext(serviceContextB);

        //Construct DeployContexts 
        let deployContexts = {}
        deployContexts[serviceNameB] = new DeployContext(serviceContextB);

        //Set deploy order 
        let deployOrder = [
            [serviceNameB],
            [serviceNameA]
        ]
        let levelToDeploy = 1;

        it('should deploy the services in the given level', function () {
            let serviceDeployers = {
                efs: {
                    deploy: function (toDeployServiceContext, toDeployPreDeployContext, dependenciesDeployContexts) {
                        throw new Error("Should not have called ECS in this level");
                    }
                },
                ecs: {
                    deploy: function (toDeployServiceContext, toDeployPreDeployContext, dependenciesDeployContexts) {
                        return Promise.resolve(new DeployContext(toDeployServiceContext));
                    }
                }
            }

            return deployPhase.deployServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployContexts, deployOrder, levelToDeploy)
                .then(deployContexts => {
                    expect(deployContexts[serviceNameA]).to.be.instanceOf(DeployContext);
                });
        });

        it('should return empty deploy contexts for the phases that dont implement deploy', function () {
            let serviceDeployers = {
                efs: {
                    deploy: function (toDeployServiceContext, toDeployPreDeployContext, dependenciesDeployContexts) {
                        throw new Error("Should not have called ECS in this level");
                    }
                },
                ecs: {
                    //Simulating that ECS doesnt implement deploy
                }
            }

            return deployPhase.deployServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployContexts, deployOrder, levelToDeploy)
                .then(deployContexts => {
                    expect(deployContexts[serviceNameA]).to.be.instanceOf(DeployContext);
                });
        });
    });
});
