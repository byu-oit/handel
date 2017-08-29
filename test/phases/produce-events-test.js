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
const ProduceEventsContext = require('../../lib/datatypes/produce-events-context');
const DeployContext = require('../../lib/datatypes/deploy-context');
const ServiceContext = require('../../lib/datatypes/service-context');
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const produceEvents = require('../../lib/phases/produce-events');
const expect = require('chai').expect;
const sinon = require('sinon');

describe('produceEvents module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('produceEvents', function () {
        it('should execute produceEvents on all services that specify themselves as producers for other services', function () {
            let serviceDeployers = {
                lambda: {
                    produceEvents: function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
                        return Promise.reject(new Error("Lambda doesn't produce events"));

                    }
                },
                s3: {
                    produceEvents: function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
                        return Promise.resolve(new ProduceEventsContext(ownServiceContext, consumerServiceContext));
                    }
                }
            };

            //Create EnvironmentContext
            let appName = "test";
            let deployVersion = "1";
            let environmentName = "dev";
            let environmentContext = new EnvironmentContext(appName, deployVersion, environmentName);

            //Construct ServiceContext B (Consuming service)
            let serviceNameB = "B";
            let serviceTypeB = "lambda"
            let paramsB = {
                other: "param"
            }
            let serviceContextB = new ServiceContext(appName, environmentName, serviceNameB, serviceTypeB, deployVersion, paramsB);
            environmentContext.serviceContexts[serviceNameB] = serviceContextB;

            //Construct ServiceContext A (Producing service)
            let serviceNameA = "A";
            let serviceTypeA = "s3";
            let paramsA = {
                some: "param",
                event_consumers: [{
                    service_name: "B"
                }]
            }
            let serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, serviceTypeA, deployVersion, paramsA);
            environmentContext.serviceContexts[serviceNameA] = serviceContextA;

            //Create deployContexts
            let deployContexts = {}
            deployContexts[serviceNameA] = new DeployContext(serviceContextA);
            deployContexts[serviceNameB] = new DeployContext(serviceContextB);

            return produceEvents.produceEvents(serviceDeployers, environmentContext, deployContexts)
                .then(produceEventsContext => {
                    expect(produceEventsContext['A->B']).to.be.instanceof(ProduceEventsContext);
                });
        });
    });
});