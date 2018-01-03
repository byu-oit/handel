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
const bindPhase = require('../../dist/phases/bind');
const EnvironmentContext = require('../../dist/datatypes').EnvironmentContext;
const ServiceContext = require('../../dist/datatypes').ServiceContext;
const PreDeployContext = require('../../dist/datatypes').PreDeployContext;
const BindContext = require('../../dist/datatypes').BindContext;
const expect = require('chai').expect;
const sinon = require('sinon');

describe('bind', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('bindServicesInLevel', function () {
        //Construct EnvironmentContext
        let appName = "FakeApp";
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

        //Construct ServiceContext C
        let serviceNameC = "C";
        let serviceTypeC = "ecs";
        let paramsC = {
            some: "param",
            dependencies: [serviceNameB]
        }
        let serviceContextC = new ServiceContext(appName, environmentName, serviceNameC, serviceTypeC, paramsC, accountConfig);
        environmentContext.serviceContexts[serviceNameC] = serviceContextC;


        //Construct PreDeployContexts
        let preDeployContexts = {}
        preDeployContexts[serviceNameA] = new PreDeployContext(serviceContextA);
        preDeployContexts[serviceNameB] = new PreDeployContext(serviceContextB);
        preDeployContexts[serviceNameC] = new PreDeployContext(serviceContextC);

        //Set deploy order 
        let deployOrder = [
            [serviceNameB],
            [serviceNameA, serviceNameC]
        ]
        let levelToBind = 0;

        it('should execute bind on all the services in parallel', function () {
            let serviceDeployers = {
                ecs: {
                    bind: function (toBindServiceContext, toBindPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
                        return Promise.reject(new Error(`Should not have called ECS bind`));
                    }
                },
                efs: {
                    bind: function (toBindServiceContext, toBindPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
                        return Promise.resolve(new BindContext(toBindServiceContext, dependentOfServiceContext));
                    }
                }
            }

            return bindPhase.bindServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployOrder, levelToBind)
                .then(bindContexts => {
                    expect(bindContexts['A->B']).to.be.instanceof(BindContext);
                    expect(bindContexts['C->B']).to.be.instanceof(BindContext);
                });
        });

        it('should return empty BindContexts for services that dont implement bind', function () {
            let serviceDeployers = {
                ecs: {
                    //Simulating that ECS doesn't implement bind
                },
                efs: {
                    bind: function (toBindServiceContext, toBindPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
                        return Promise.resolve(new BindContext(toBindServiceContext, dependentOfServiceContext));
                    }
                }
            }

            return bindPhase.bindServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployOrder, levelToBind)
                .then(bindContexts => {
                    expect(bindContexts['A->B']).to.be.instanceof(BindContext);
                    expect(bindContexts['C->B']).to.be.instanceof(BindContext);
                });
        });
    });
});