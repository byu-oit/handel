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
import { AccountConfig, DeployOutputType, ServiceConfig, ServiceContext, ServiceType } from 'handel-extension-api';
import 'mocha';
import config from '../../src/account-config/account-config';
import { EnvironmentContext } from '../../src/datatypes';
import * as checkPhase from '../../src/phases/check';
import { STDLIB_PREFIX } from '../../src/services/stdlib';
import FakeServiceRegistry from '../service-registry/fake-service-registry';

describe('check', () => {
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    describe('checkServices', () => {
        function getServiceRegistry(): FakeServiceRegistry {
            return new FakeServiceRegistry({
                ecs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [
                        DeployOutputType.SecurityGroups,
                        DeployOutputType.Policies,
                        DeployOutputType.Scripts,
                        DeployOutputType.EnvironmentVariables
                    ],
                    check: (serviceContext: ServiceContext<ServiceConfig>) => {
                        return [];
                    },
                    supportsTagging: true,
                },
                efs: {
                    producedEventsSupportedTypes: [],
                    producedDeployOutputTypes: [
                        DeployOutputType.EnvironmentVariables,
                        DeployOutputType.Scripts,
                        DeployOutputType.SecurityGroups
                    ],
                    consumedDeployOutputTypes: [],
                    supportsTagging: true,
                }
                // We're pretending that EFS doesn't implement check (even though it really does) for the purposes of this test.
            });
        }

        function getEnvironmentContext() {
            // Construct EnvironmentContext
            const appName = 'FakeApp';
            const environmentName = 'dev';
            const environmentContext = new EnvironmentContext(appName, environmentName, accountConfig);

            // Construct ServiceContext A
            const serviceNameA = 'A';
            const serviceTypeA = 'ecs';
            const paramsA = {
                type: serviceTypeA,
                some: 'param'
            };
            const serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, new ServiceType(STDLIB_PREFIX, serviceTypeA), paramsA, accountConfig);
            environmentContext.serviceContexts[serviceNameA] = serviceContextA;

            // Construct ServiceContext B
            const serviceNameB = 'B';
            const serviceTypeB = 'efs';
            const paramsB = {
                type: serviceTypeB,
                other: 'param'
            };
            const serviceContextB = new ServiceContext(appName, environmentName, serviceNameB, new ServiceType(STDLIB_PREFIX, serviceTypeB), paramsB, accountConfig);
            environmentContext.serviceContexts[serviceNameB] = serviceContextB;
            return environmentContext;
        }

        it('should run check services on all services in the environment that implement check', async () => {
            const serviceRegistry = getServiceRegistry();
            const environmentContext = getEnvironmentContext();

            const checkResults = await checkPhase.checkServices(serviceRegistry, environmentContext);
            expect(checkResults).to.deep.equal([]);
        });

        it('should return errors when there are errors in one or more services', async () => {
            const serviceRegistry = getServiceRegistry();
            const ecsErrors = ['ECS Error'];
            serviceRegistry.services.ecs.check = () => ecsErrors;
            const environmentContext = getEnvironmentContext();

            const checkResults = await checkPhase.checkServices(serviceRegistry, environmentContext);
            expect(checkResults.length).to.equal(1);
            expect(checkResults[0]).to.include(ecsErrors[0]);
        });

        it('should enforce required tags from the account config file', async () => {
            accountConfig.required_tags = ['app_tag', 'resource_tag'];

            const serviceRegistry = getServiceRegistry();
            const environmentContext = getEnvironmentContext();

            const appTags = {app_tag: 'value'};

            // A will have all required tags set, one at the app level, one at the resource level
            environmentContext.serviceContexts.A.tags = appTags;
            environmentContext.serviceContexts.A.params.tags = {resource_tag: 'value'};

            // B forgot the resource tag!
            environmentContext.serviceContexts.B.tags = appTags;

            const checkResults = await checkPhase.checkServices(serviceRegistry, environmentContext);
            expect(checkResults).to.have.lengthOf(1);
            expect(checkResults[0]).to.include('Missing required tag \'resource_tag\'');
        });
    });
});
