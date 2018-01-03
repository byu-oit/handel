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
const unBindPhase = require('../../dist/phases/un-bind');
const EnvironmentContext = require('../../dist/datatypes').EnvironmentContext;
const ServiceContext = require('../../dist/datatypes').ServiceContext;
const UnBindContext = require('../../dist/datatypes').UnBindContext;
const expect = require('chai').expect;
const sinon = require('sinon');

describe('unBind', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('unBindServicesInLevel', function () {
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

        //Set deploy order 
        let deployOrder = [
            [serviceNameB],
            [serviceNameA]
        ]
        let levelToUnBind = 0;

        it('should execute UnBind on all the services in parallel', function () {
            let serviceDeployers = {
                ecs: {
                    unBind: function (toUnBindServiceContext) {
                        return Promise.reject(new Error(`Should not have called ECS bind`));
                    }
                },
                efs: {
                    unBind: function (toUnBindServiceContext) {
                        return Promise.resolve(new UnBindContext(toUnBindServiceContext));
                    }
                }
            }

            return unBindPhase.unBindServicesInLevel(serviceDeployers, environmentContext, deployOrder, levelToUnBind)
                .then(unBindContexts => {
                    expect(unBindContexts['B']).to.be.instanceof(UnBindContext);
                });
        });

        it('should return emtpy unbind contexts for services that dont implement unbind', function() {
            let serviceDeployers = {
                ecs: {
                    unBind: function (toUnBindServiceContext) {
                        return Promise.reject(new Error(`Should not have called ECS bind`));
                    }
                },
                efs: {
                    //Simulating that EFS doesn't implement unbind
                }
            }

            return unBindPhase.unBindServicesInLevel(serviceDeployers, environmentContext, deployOrder, levelToUnBind)
                .then(unBindContexts => {
                    expect(unBindContexts['B']).to.be.instanceof(UnBindContext);
                });
        });
    });
});