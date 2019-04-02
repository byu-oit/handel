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
import {
    AccountConfig,
    BindContext,
    PreDeployContext,
    ServiceContext,
    ServiceType
} from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import {
    DeployOrder,
    EnvironmentContext,
    PreDeployContexts
} from '../../src/datatypes';
import * as bindPhase from '../../src/phases/bind';
import { STDLIB_PREFIX } from '../../src/services/stdlib';
import FakeServiceRegistry from '../service-registry/fake-service-registry';

describe('bind', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        sandbox = sinon.createSandbox();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('bindServicesInLevel', () => {
        // environmentContext, preDeployContexts, deployOrder, levelToBind
        let environmentContext: EnvironmentContext;
        let preDeployContexts: PreDeployContexts;
        let deployOrder: DeployOrder;
        let levelToBind: number;

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

            // Construct ServiceContext C
            const serviceNameC = 'C';
            const serviceTypeC = 'ecs';
            const paramsC = {
                type: serviceTypeC,
                some: 'param',
                dependencies: [serviceNameB]
            };
            const serviceContextC = new ServiceContext(appName, environmentName, serviceNameC, new ServiceType(STDLIB_PREFIX, serviceTypeC), paramsC, accountConfig);
            environmentContext.serviceContexts[serviceNameC] = serviceContextC;

            // Construct PreDeployContexts
            preDeployContexts = {};
            preDeployContexts[serviceNameA] = new PreDeployContext(serviceContextA);
            preDeployContexts[serviceNameB] = new PreDeployContext(serviceContextB);
            preDeployContexts[serviceNameC] = new PreDeployContext(serviceContextC);

            // Set deploy order
            deployOrder = [
                [serviceNameB],
                [serviceNameA, serviceNameC]
            ];
            levelToBind = 0;
        });

        it('should execute bind on all the services in parallel', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                ecs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [],
                    bind: (toBindServiceContext, toBindPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) => {
                        return Promise.reject(new Error(`Should not have called ECS bind`));
                    },
                    supportsTagging: true,
                },
                efs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [],
                    bind: (toBindServiceContext, toBindPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) => {
                        return Promise.resolve(new BindContext(toBindServiceContext, dependentOfServiceContext));
                    },
                    supportsTagging: true,
                }
            });

            const bindContexts = await bindPhase.bindServicesInLevel(serviceRegistry, environmentContext, preDeployContexts, deployOrder, levelToBind);
            expect(bindContexts['A->B']).to.be.instanceof(BindContext);
            expect(bindContexts['C->B']).to.be.instanceof(BindContext);
        });

        it('should return empty BindContexts for services that dont implement bind', async () => {
            const serviceRegistry = new FakeServiceRegistry({
                ecs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [],
                    // Simulating that ECS doesn't implement bind,
                    supportsTagging: true,
                },
                efs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [],
                    bind: (toBindServiceContext, toBindPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) => {
                        return Promise.resolve(new BindContext(toBindServiceContext, dependentOfServiceContext));
                    },
                    supportsTagging: true,
                }
            });

            const bindContexts = await bindPhase.bindServicesInLevel(serviceRegistry, environmentContext, preDeployContexts, deployOrder, levelToBind);
            expect(bindContexts['A->B']).to.be.instanceof(BindContext);
            expect(bindContexts['C->B']).to.be.instanceof(BindContext);
        });
    });
});
