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
const ConsumeEventsContext = require('../../dist/datatypes/consume-events-context');
const DeployContext = require('../../dist/datatypes/deploy-context');
const ServiceContext = require('../../dist/datatypes/service-context');
const EnvironmentContext = require('../../dist/datatypes/environment-context');
const consumeEvents = require('../../dist/phases/consume-events');
const expect = require('chai').expect;
const sinon = require('sinon');

describe('consumeEvents module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('consumeEvents', function () {
        it('should execute consumeEvents on all services that are specified as consumers by other services', function () {
            let serviceDeployers = {
                lambda: {
                    consumeEvents: function (ownServiceContext,  ownDeployContext,  producerServiceContext,  producerDeployContext) {
                        return Promise.resolve(new ConsumeEventsContext(ownServiceContext, producerServiceContext));
                    }
                },
                s3: {
                    consumeEvents: function (ownServiceContext,  ownDeployContext,  producerServiceContext,  producerDeployContext) {
                        return Promise.reject(new Error("S3 doesn't consume events"));
                    }
                }
            };

            //Create EnvironmentContext
            let appName = "test";
            let environmentName = "dev";
            let accountConfig = {};
            let environmentContext = new EnvironmentContext(appName, environmentName, accountConfig);

            //Construct ServiceContext B (Consuming service)
            let serviceNameB = "B";
            let serviceTypeB = "lambda"
            let paramsB = {
                other: "param"
            }
            let serviceContextB = new ServiceContext(appName, environmentName, serviceNameB, serviceTypeB, paramsB, accountConfig);
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
            let serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, serviceTypeA, paramsA, accountConfig);
            environmentContext.serviceContexts[serviceNameA] = serviceContextA;

            //Create deployContexts
            let deployContexts = {}
            deployContexts[serviceNameA] = new DeployContext(serviceContextA);
            deployContexts[serviceNameB] = new DeployContext(serviceContextB);

            return consumeEvents.consumeEvents(serviceDeployers, environmentContext, deployContexts)
                .then(consumeEventsContexts => {
                    expect(consumeEventsContexts['B->A']).to.be.instanceof(ConsumeEventsContext);
                });
        });
    });
});