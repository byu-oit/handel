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
import { AccountConfig, DeployOutputType, PreDeployContext, ServiceConfig, ServiceContext, ServiceType } from 'handel-extension-api';
import 'mocha';
import config from '../../src/account-config/account-config';
import { EnvironmentContext } from '../../src/datatypes';
import * as preDeployPhase from '../../src/phases/pre-deploy';
import { STDLIB_PREFIX } from '../../src/services/stdlib';
import FakeServiceRegistry from '../service-registry/fake-service-registry';

describe('preDeploy', () => {
    let accountConfig: AccountConfig;
    let environmentContext: EnvironmentContext;
    let serviceNameA: string;
    let serviceNameB: string;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);

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

    describe('preDeployServices', () => {
        it('should execute predeploy on all services, even across levels', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                efs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [
                        DeployOutputType.Scripts,
                        DeployOutputType.EnvironmentVariables,
                        DeployOutputType.SecurityGroups
                    ],
                    consumedDeployOutputTypes: [],
                    preDeploy: async (serviceContext: ServiceContext<ServiceConfig>) => {
                        return new PreDeployContext(serviceContext);
                    },
                    supportsTagging: true,
                },
                ecs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [
                        DeployOutputType.Scripts,
                        DeployOutputType.EnvironmentVariables,
                        DeployOutputType.SecurityGroups,
                        DeployOutputType.Policies
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
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [
                        DeployOutputType.Scripts,
                        DeployOutputType.EnvironmentVariables,
                        DeployOutputType.SecurityGroups
                    ],
                    consumedDeployOutputTypes: [],
                    preDeploy: async (serviceContext: ServiceContext<ServiceConfig>) => {
                        return new PreDeployContext(serviceContext);
                    },
                    supportsTagging: true,
                },
                ecs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [
                        DeployOutputType.Scripts,
                        DeployOutputType.EnvironmentVariables,
                        DeployOutputType.SecurityGroups,
                        DeployOutputType.Policies
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

    describe('getPreDeployContexts', () => {
        it('should execute getPreDeployContext on all services, even across levels', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                efs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [
                        DeployOutputType.Scripts,
                        DeployOutputType.EnvironmentVariables,
                        DeployOutputType.SecurityGroups
                    ],
                    consumedDeployOutputTypes: [],
                    preDeploy: async (serviceContext: ServiceContext<ServiceConfig>) => {
                        return new PreDeployContext(serviceContext);
                    },
                    getPreDeployContext: async (serviceContext: ServiceContext<ServiceConfig>) => {
                        return new PreDeployContext(serviceContext);
                    },
                    supportsTagging: true,
                },
                ecs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [
                        DeployOutputType.Scripts,
                        DeployOutputType.EnvironmentVariables,
                        DeployOutputType.SecurityGroups,
                        DeployOutputType.Policies
                    ],
                    preDeploy: async (serviceContext: ServiceContext<ServiceConfig>) => {
                        return new PreDeployContext(serviceContext);
                    },
                    getPreDeployContext: async (serviceContext: ServiceContext<ServiceConfig>) => {
                        return new PreDeployContext(serviceContext);
                    },
                    supportsTagging: true,
                }
            });

            const retPreDeployContexts = await preDeployPhase.getPreDeployContexts(serviceRegistry, environmentContext);
            expect(retPreDeployContexts[serviceNameA]).to.be.instanceof(PreDeployContext);
            expect(retPreDeployContexts[serviceNameB]).to.be.instanceof(PreDeployContext);
        });

        it('should return empty preDeployContexts for services that dont implement preDeploy', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                efs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [
                        DeployOutputType.Scripts,
                        DeployOutputType.EnvironmentVariables,
                        DeployOutputType.SecurityGroups
                    ],
                    consumedDeployOutputTypes: [],
                    preDeploy: async (serviceContext: ServiceContext<ServiceConfig>) => {
                        return new PreDeployContext(serviceContext);
                    },
                    getPreDeployContext: async (serviceContext: ServiceContext<ServiceConfig>) => {
                        return new PreDeployContext(serviceContext);
                    },
                    supportsTagging: true,
                },
                ecs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [
                        DeployOutputType.Scripts,
                        DeployOutputType.EnvironmentVariables,
                        DeployOutputType.SecurityGroups,
                        DeployOutputType.Policies
                    ],
                    supportsTagging: true,
                    // We're pretending here that ECS doesn't implement predeploy for the purposes of this test, even though it really does
                }
            });

            const retPreDeployContexts = await preDeployPhase.getPreDeployContexts(serviceRegistry, environmentContext);
            expect(retPreDeployContexts[serviceNameA]).to.be.instanceof(PreDeployContext);
            expect(retPreDeployContexts[serviceNameB]).to.be.instanceof(PreDeployContext);
        });

        it('should throw an error when a service that implements preDeploy doesnt implement getPreDeployContext', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                efs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [
                        DeployOutputType.Scripts,
                        DeployOutputType.EnvironmentVariables,
                        DeployOutputType.SecurityGroups
                    ],
                    consumedDeployOutputTypes: [],
                    preDeploy: async (serviceContext: ServiceContext<ServiceConfig>) => {
                        return new PreDeployContext(serviceContext);
                    },
                    supportsTagging: true,
                }
            });

            try {
                const retPreDeployContexts = await preDeployPhase.getPreDeployContexts(serviceRegistry, environmentContext);
            }
            catch(err) {
                expect(err.message).to.include('Expected getPreDeployContext');
            }
        });
    });
});
