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
import { AccountConfig, EnvironmentContext, ServiceContext, UnDeployContext } from '../../src/datatypes';
import * as unDeployPhase from '../../src/phases/un-deploy';
import FakeServiceRegistry from '../service-registry/fake-service-registry';

describe('unDeploy', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('unDeployServicesInLevel', () => {
        // Create EnvironmentContext
        const appName = 'test';
        const environmentName = 'dev';
        const environmentContext = new EnvironmentContext(appName, environmentName, accountConfig);

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
        const serviceNameA = 'A';
        const serviceTypeA = 'ecs';
        const paramsA = {
            type: serviceTypeA,
            some: 'param',
            dependencies: [serviceNameB]
        };
        const serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, serviceTypeA, paramsA, accountConfig);
        environmentContext.serviceContexts[serviceNameA] = serviceContextA;

        // Set deploy order
        const deployOrder = [
            [serviceNameB],
            [serviceNameA]
        ];
        const levelToUnDeploy = 1;

        it('should UnDeploy the services in the given level', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                efs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [
                        'securityGroups',
                        'scripts',
                        'environmentVariables',
                    ],
                    consumedDeployOutputTypes: [],
                    unDeploy: (toUnDeployServiceContext) => {
                        throw new Error('Should not have called ECS in this level');
                    },
                    supportsTagging: true,
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
                    unDeploy: (toUnDeployServiceContext) => {
                        return Promise.resolve(new UnDeployContext(toUnDeployServiceContext));
                    },
                    supportsTagging: true,
                }
            });

            const unDeployContexts = await unDeployPhase.unDeployServicesInLevel(serviceRegistry, environmentContext, deployOrder, levelToUnDeploy);
            expect(unDeployContexts[serviceNameA]).to.be.instanceOf(UnDeployContext);
        });

        it('should return emtpy undeploy contexts for services that dont implment undeploy', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                efs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [
                        'securityGroups',
                        'scripts',
                        'environmentVariables',
                    ],
                    consumedDeployOutputTypes: [],
                    unDeploy: (toUnDeployServiceContext) => {
                        throw new Error('Should not have called ECS in this level');
                    },
                    supportsTagging: true,
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
                    supportsTagging: true,
                    // Simulating that ECS doesn't implement undeploy
                }
            });

            const unDeployContexts = await unDeployPhase.unDeployServicesInLevel(serviceRegistry, environmentContext, deployOrder, levelToUnDeploy);
            expect(unDeployContexts[serviceNameA]).to.be.instanceOf(UnDeployContext);
        });
    });
});
