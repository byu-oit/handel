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
import { AccountConfig, DeployOutputType, PreDeployContext, ServiceContext, ServiceType, UnBindContext } from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import { DeployOrder, EnvironmentContext, PreDeployContexts, } from '../../src/datatypes';
import * as unBindPhase from '../../src/phases/un-bind';
import { STDLIB_PREFIX } from '../../src/services/stdlib';
import FakeServiceRegistry from '../service-registry/fake-service-registry';

describe('unBind', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('unBindServicesInLevel', () => {
        let environmentContext: EnvironmentContext;
        let preDeployContexts: PreDeployContexts;
        let deployOrder: DeployOrder;
        let levelToUnBind: number;

        beforeEach(() => {
            // Construct EnvironmentContext
            const appName = 'FakeApp';
            const environmentName = 'dev';
            environmentContext = new EnvironmentContext(appName, environmentName, accountConfig);

            // Construct ServiceContext B
            const serviceNameB = 'B';
            const serviceTypeB = 'efs';
            const paramsB = {
                type: serviceTypeB,
                other: 'param'
            };
            const serviceContextB = new ServiceContext(appName, environmentName, serviceNameB, new ServiceType(STDLIB_PREFIX, serviceTypeB), paramsB, accountConfig);
            environmentContext.serviceContexts[serviceNameB] = serviceContextB;

            // Construct ServiceContext A
            const serviceNameA = 'A';
            const serviceTypeA = 'ecs';
            const paramsA = {
                type: serviceTypeA,
                some: 'param',
                dependencies: [serviceNameB]
            };
            const serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, new ServiceType(STDLIB_PREFIX, serviceTypeA), paramsA, accountConfig);
            environmentContext.serviceContexts[serviceNameA] = serviceContextA;

            // Construct PreDeployContexts
            preDeployContexts = {};
            preDeployContexts[serviceNameA] = new PreDeployContext(serviceContextA);
            preDeployContexts[serviceNameB] = new PreDeployContext(serviceContextB);

            // Set deploy order
            deployOrder = [
                [serviceNameB],
                [serviceNameA]
            ];
            levelToUnBind = 0;
        });

        it('should execute UnBind on all the services in parallel', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                ecs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [
                        DeployOutputType.SecurityGroups,
                        DeployOutputType.Scripts,
                        DeployOutputType.EnvironmentVariables,
                        DeployOutputType.Policies
                    ],
                    unBind: (toUnBindServiceContext) => {
                        return Promise.reject(new Error(`Should not have called ECS bind`));
                    },
                    supportsTagging: true,
                },
                efs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [
                        DeployOutputType.SecurityGroups,
                        DeployOutputType.Scripts,
                        DeployOutputType.EnvironmentVariables
                    ],
                    consumedDeployOutputTypes: [],
                    unBind: (toUnBindServiceContext) => {
                        return Promise.resolve(new UnBindContext(toUnBindServiceContext));
                    },
                    supportsTagging: true,
                }
            });

            const unBindContexts = await unBindPhase.unBindServicesInLevel(serviceRegistry, environmentContext, preDeployContexts, deployOrder, levelToUnBind);
            expect(unBindContexts['A->B']).to.be.instanceof(UnBindContext);
        });

        it('should return emtpy unbind contexts for services that dont implement unbind', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                ecs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [
                        DeployOutputType.SecurityGroups,
                        DeployOutputType.Scripts,
                        DeployOutputType.EnvironmentVariables,
                        DeployOutputType.Policies
                    ],
                    unBind: (toUnBindServiceContext) => {
                        return Promise.reject(new Error(`Should not have called ECS bind`));
                    },
                    supportsTagging: true,
                },
                efs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [
                        DeployOutputType.SecurityGroups,
                        DeployOutputType.Scripts,
                        DeployOutputType.EnvironmentVariables
                    ],
                    consumedDeployOutputTypes: [],
                    supportsTagging: true,
                    // Simulating that EFS doesn't implement unbind
                }
            });

            const unBindContexts = await unBindPhase.unBindServicesInLevel(serviceRegistry, environmentContext, preDeployContexts, deployOrder, levelToUnBind);
            expect(unBindContexts['A->B']).to.be.instanceof(UnBindContext);
        });
    });
});
