/*
 * Copyright 2018 Brigham Young University
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
import { expect } from 'chai';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import { AccountConfig, ConsumeEventsContext, DeployContext, DeployContexts, EnvironmentContext, ServiceContext } from '../../src/datatypes';
import * as consumeEvents from '../../src/phases/consume-events';
import FakeServiceRegistry from '../service-registry/fake-service-registry';

describe('consumeEvents module', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('consumeEvents', () => {
        it('should execute consumeEvents on all services that are specified as consumers by other services', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                lambda: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [],
                    consumeEvents: (ownServiceContext,  ownDeployContext,  producerServiceContext,  producerDeployContext) => {
                        return Promise.resolve(new ConsumeEventsContext(ownServiceContext, producerServiceContext));
                    },
                    supportsTagging: true,
                },
                s3: {
                    producedEventsSupportedServices: [
                        'lambda'
                    ],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [],
                    consumeEvents: (ownServiceContext,  ownDeployContext,  producerServiceContext,  producerDeployContext) => {
                        return Promise.reject(new Error('S3 doesn\'t consume events'));
                    },
                    supportsTagging: true,
                }
            });

            // Create EnvironmentContext
            const appName = 'test';
            const environmentName = 'dev';
            const environmentContext = new EnvironmentContext(appName, environmentName, accountConfig);

            // Construct ServiceContext B (Consuming service)
            const serviceNameB = 'B';
            const serviceTypeB = 'lambda';
            const paramsB = {
                type: serviceTypeB,
                other: 'param'
            };
            const serviceContextB = new ServiceContext(appName, environmentName, serviceNameB, serviceTypeB, paramsB, accountConfig, new FakeServiceRegistry());
            environmentContext.serviceContexts[serviceNameB] = serviceContextB;

            // Construct ServiceContext A (Producing service)
            const serviceNameA = 'A';
            const serviceTypeA = 's3';
            const paramsA = {
                type: serviceTypeA,
                some: 'param',
                event_consumers: [{
                    service_name: 'B'
                }]
            };
            const serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, serviceTypeA, paramsA, accountConfig, new FakeServiceRegistry());
            environmentContext.serviceContexts[serviceNameA] = serviceContextA;

            // Create deployContexts
            const deployContexts: DeployContexts = {};
            deployContexts[serviceNameA] = new DeployContext(serviceContextA);
            deployContexts[serviceNameB] = new DeployContext(serviceContextB);

            const consumeEventsContexts = await consumeEvents.consumeEvents(serviceRegistry, environmentContext, deployContexts);
            expect(consumeEventsContexts['B->A']).to.be.instanceof(ConsumeEventsContext);
        });
    });
});
