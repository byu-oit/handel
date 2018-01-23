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
import { expect } from 'chai';
import config from '../../src/account-config/account-config';
import { AccountConfig, EnvironmentContext, ServiceContext, ServiceDeployers, UnPreDeployContext } from '../../src/datatypes';
import * as unPreDeployPhase from '../../src/phases/un-pre-deploy';

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
            const serviceContextB = new ServiceContext(appName, environmentName, serviceNameB, serviceTypeB, paramsB, accountConfig);
            environmentContext.serviceContexts[serviceNameB] = serviceContextB;

            // Construct ServiceContext A
            serviceNameA = 'A';
            const serviceTypeA = 'ecs';
            const paramsA = {
                type: serviceTypeA,
                some: 'param',
                dependencies: [serviceNameB]
            };
            const serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, serviceTypeA, paramsA, accountConfig);
            environmentContext.serviceContexts[serviceNameA] = serviceContextA;
        });

        it('should execute unpredeploy on all services, even across levels', async () => {
            const serviceDeployers: ServiceDeployers = {
                efs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [
                        'securityGroups',
                        'scripts',
                        'environmentVariables',
                    ],
                    consumedDeployOutputTypes: [],
                    unPreDeploy: (serviceContext) => {
                        return Promise.resolve(new UnPreDeployContext(serviceContext));
                    }
                },
                ecs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [
                        'securityGroups',
                        'scripts',
                        'environmentVariables',
                        'policies'
                    ],
                    unPreDeploy: (serviceContext) => {
                        return Promise.resolve(new UnPreDeployContext(serviceContext));
                    }
                }
            };

            const unPreDeployContexts = await unPreDeployPhase.unPreDeployServices(serviceDeployers, environmentContext);
            expect(unPreDeployContexts[serviceNameA]).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployContexts[serviceNameB]).to.be.instanceof(UnPreDeployContext);
        });

        it('should return empty unpredeploy contexts for deployers that dont implement unpredeploy', async () => {
            const serviceDeployers: ServiceDeployers = {
                efs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [
                        'securityGroups',
                        'scripts',
                        'environmentVariables',
                    ],
                    consumedDeployOutputTypes: [],
                    unPreDeploy: (serviceContext) => {
                        return Promise.resolve(new UnPreDeployContext(serviceContext));
                    }
                },
                ecs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [
                        'securityGroups',
                        'scripts',
                        'environmentVariables',
                        'policies'
                    ]
                    // Simulating that ECS doesn't implement unpredeploy
                }
            };

            const unPreDeployContexts = await unPreDeployPhase.unPreDeployServices(serviceDeployers, environmentContext);
            expect(unPreDeployContexts[serviceNameA]).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployContexts[serviceNameB]).to.be.instanceof(UnPreDeployContext);
        });
    });
});
