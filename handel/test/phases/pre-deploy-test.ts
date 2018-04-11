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
import { PreDeployContext } from 'handel-extension-api';
import 'mocha';
import config from '../../src/account-config/account-config';
import { AccountConfig, EnvironmentContext, ServiceConfig, ServiceContext, ServiceType } from '../../src/datatypes';
import * as preDeployPhase from '../../src/phases/pre-deploy';
import { STDLIB_PREFIX } from '../../src/services/stdlib';
import FakeServiceRegistry from '../service-registry/fake-service-registry';

describe('preDeploy', () => {
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    describe('preDeployServices', () => {
        let environmentContext: EnvironmentContext;
        let serviceNameA: string;
        let serviceNameB: string;

        beforeEach(() => {
            // Create EnvironmentContext
            const appName = 'test';
            const environmentName = 'dev';
            environmentContext = new EnvironmentContext(appName, environmentName, accountConfig);

            // Construct ServiceContext B
            serviceNameB = 'B';
            const serviceTypeB = 'efs';
            const paramsB = {
                type: serviceTypeB,
                other: 'param'
            };
            const serviceContextB = new ServiceContext(appName, environmentName, serviceNameB, new ServiceType(STDLIB_PREFIX, serviceTypeB), paramsB, accountConfig);
            environmentContext.serviceContexts[serviceNameB] = serviceContextB;

            // Construct ServiceContext A
            serviceNameA = 'A';
            const serviceTypeA = 'ecs';
            const paramsA = {
                type: serviceTypeA,
                some: 'param',
                dependencies: [serviceNameB]
            };
            const serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, new ServiceType(STDLIB_PREFIX, serviceTypeA), paramsA, accountConfig);
            environmentContext.serviceContexts[serviceNameA] = serviceContextA;
        });

        it('should execute predeploy on all services, even across levels', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                efs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [
                        'scripts',
                        'environmentVariables',
                        'securityGroups'
                    ],
                    consumedDeployOutputTypes: [],
                    preDeploy: async (serviceContext: ServiceContext<ServiceConfig>) => {
                        return new PreDeployContext(serviceContext);
                    },
                    supportsTagging: true,
                },
                ecs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [
                        'scripts',
                        'environmentVariables',
                        'securityGroups',
                        'policies'
                    ],
                    preDeploy: async (serviceContext: ServiceContext<ServiceConfig>) => {
                        return new PreDeployContext(serviceContext);
                    },
                    supportsTagging: true,
                }
            });

            const retPreDeployContexts = await preDeployPhase.preDeployServices(serviceRegistry, environmentContext);
            expect(retPreDeployContexts[serviceNameA]).to.be.instanceof(PreDeployContext);
            expect(retPreDeployContexts[serviceNameB]).to.be.instanceof(PreDeployContext);
        });

        it('should return empty preDeployContexts for services that dont implement preDeploy', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                efs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [
                        'scripts',
                        'environmentVariables',
                        'securityGroups'
                    ],
                    consumedDeployOutputTypes: [],
                    preDeploy: async (serviceContext: ServiceContext<ServiceConfig>) => {
                        return new PreDeployContext(serviceContext);
                    },
                    supportsTagging: true,
                },
                ecs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [
                        'scripts',
                        'environmentVariables',
                        'securityGroups',
                        'policies'
                    ],
                    supportsTagging: true,
                    // We're pretending here that ECS doesn't implement predeploy for the purposes of this test, even though it really does
                }
            });

            const retPreDeployContexts = await preDeployPhase.preDeployServices(serviceRegistry, environmentContext);
            expect(retPreDeployContexts[serviceNameA]).to.be.instanceof(PreDeployContext);
            expect(retPreDeployContexts[serviceNameB]).to.be.instanceof(PreDeployContext);
        });
    });
});
