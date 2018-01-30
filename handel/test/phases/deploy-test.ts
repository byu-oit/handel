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
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import { AccountConfig, DeployContext, DeployContexts, DeployOrder, EnvironmentContext, PreDeployContext, PreDeployContexts, ServiceContext, ServiceDeployers } from '../../src/datatypes';
import * as deployPhase from '../../src/phases/deploy';

describe('deploy', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('deployServicesInLevel', () => {
        let serviceNameA: string;
        let environmentContext: EnvironmentContext;
        let preDeployContexts: PreDeployContexts;
        let deployContexts: DeployContexts;
        let deployOrder: DeployOrder;
        let levelToDeploy: number;

        beforeEach(() => {
            // Create EnvironmentContext
            const appName = 'test';
            const environmentName = 'dev';
            environmentContext = new EnvironmentContext(appName, environmentName, accountConfig);

            // Construct ServiceContext B
            const serviceNameB = 'B';
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

            // Construct PreDeployContexts
            preDeployContexts = {};
            preDeployContexts[serviceNameA] = new PreDeployContext(serviceContextA);
            preDeployContexts[serviceNameB] = new PreDeployContext(serviceContextB);

            // Construct DeployContexts
            deployContexts = {};
            deployContexts[serviceNameB] = new DeployContext(serviceContextB);

            // Set deploy order
            deployOrder = [
                [serviceNameB],
                [serviceNameA]
            ];
            levelToDeploy = 1;
        });

        it('should deploy the services in the given level', async () => {
            const serviceDeployers: ServiceDeployers = {
                efs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [
                        'scripts',
                        'environmentVariables',
                        'securityGroups'
                    ],
                    consumedDeployOutputTypes: [],
                    deploy: async (toDeployServiceContext, toDeployPreDeployContext, dependenciesDeployContexts) => {
                        throw new Error('Should not have called ECS in this level');
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
                    deploy: async (toDeployServiceContext, toDeployPreDeployContext, dependenciesDeployContexts) => {
                        return new DeployContext(toDeployServiceContext);
                    },
                    supportsTagging: true,
                }
            };

            const retDeployContexts = await deployPhase.deployServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployContexts, deployOrder, levelToDeploy);
            expect(retDeployContexts[serviceNameA]).to.be.instanceOf(DeployContext);
        });

        it('should return empty deploy contexts for the phases that dont implement deploy', async () => {
            const serviceDeployers: ServiceDeployers = {
                efs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [
                        'scripts',
                        'environmentVariables',
                        'securityGroups'
                    ],
                    consumedDeployOutputTypes: [],
                    deploy: async (toDeployServiceContext, toDeployPreDeployContext, dependenciesDeployContexts) => {
                        throw new Error('Should not have called ECS in this level');
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
                    // Simulating that ECS doesnt implement deploy
                }
            };

            const retDeployContexts = await deployPhase.deployServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployContexts, deployOrder, levelToDeploy);
            expect(retDeployContexts[serviceNameA]).to.be.instanceOf(DeployContext);
        });
    });
});
