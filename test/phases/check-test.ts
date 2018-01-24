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
import config from '../../src/account-config/account-config';
import { AccountConfig, EnvironmentContext, ServiceConfig, ServiceContext, ServiceDeployers } from '../../src/datatypes';
import * as checkPhase from '../../src/phases/check';

describe('check', () => {
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    describe('checkServices', () => {
        function getServiceDeployers(): ServiceDeployers {
            return {
                ecs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [],
                    consumedDeployOutputTypes: [
                        'securityGroups',
                        'policies',
                        'scripts',
                        'environmentVariables',
                    ],
                    check: (serviceContext: ServiceContext<ServiceConfig>) => {
                        return [];
                    }
                },
                efs: {
                    producedEventsSupportedServices: [],
                    producedDeployOutputTypes: [
                        'environmentVariables',
                        'scripts',
                        'securityGroups'
                    ],
                    consumedDeployOutputTypes: [],
                }
                // We're pretending that EFS doesn't implement check (even though it really does) for the purposes of this test.
            };
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
            const serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, serviceTypeA, paramsA, accountConfig);
            environmentContext.serviceContexts[serviceNameA] = serviceContextA;

            // Construct ServiceContext B
            const serviceNameB = 'B';
            const serviceTypeB = 'efs';
            const paramsB = {
                type: serviceTypeB,
                other: 'param'
            };
            const serviceContextB = new ServiceContext(appName, environmentName, serviceNameB, serviceTypeB, paramsB, accountConfig);
            environmentContext.serviceContexts[serviceNameB] = serviceContextB;
            return environmentContext;
        }

        it('should run check services on all services in the environment that implement check', () => {
            const serviceDeployers = getServiceDeployers();
            const environmentContext = getEnvironmentContext();

            const checkResults = checkPhase.checkServices(serviceDeployers, environmentContext);
            expect(checkResults).to.deep.equal([]);
        });

        it('should return errors when there are errors in one or more services', () => {
            const serviceDeployers = getServiceDeployers();
            const ecsErrors = ['ECS Error'];
            serviceDeployers.ecs.check = () => ecsErrors;
            const environmentContext = getEnvironmentContext();

            const checkResults = checkPhase.checkServices(serviceDeployers, environmentContext);
            expect(checkResults).to.deep.equal(ecsErrors);
        });
    });
});
