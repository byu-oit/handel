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
import { DeployContext } from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import * as ecsContainers from '../../src/common/ecs-containers';
import * as ecsRouting from '../../src/common/ecs-routing';
import * as ecsVolumes from '../../src/common/ecs-volumes';
import { AccountConfig, ServiceContext, ServiceType } from '../../src/datatypes';
import { FargateServiceConfig } from '../../src/services/ecs-fargate/config-types';
import { STDLIB_PREFIX } from '../../src/services/stdlib';

describe('ecs containers common module', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;
    let serviceContext: ServiceContext<FargateServiceConfig>;
    let serviceParams: FargateServiceConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
        serviceParams = {
            type: 'ecs',
            containers: [
                {
                    name: 'mycontainername',
                    image_name: '<account>/fakeimagename:latest',
                    environment_variables: {
                        MY_VAR: 'myValue'
                    },
                    routing: {
                        base_path: '/'
                    },
                    port_mappings: [
                        5000
                    ],
                    links: [
                        'otherContainer'
                    ]
                },
                {
                    name: 'otherContainer'
                }
            ],
            auto_scaling: {
                min_tasks: 1,
                max_tasks: 1
            }
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'ecs'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getContainersConfig', () => {
        it('should return the configuration for containers from the Handel file', () => {
            const getMountPointsStub = sandbox.stub(ecsVolumes, 'getMountPointsForContainer').returns([]);
            const getRoutingInfoStub = sandbox.stub(ecsRouting, 'getRoutingInformationForContainer').returns([]);

            const dependencyServiceContext = new ServiceContext(appName, envName, 'FakeOtherService', new ServiceType(STDLIB_PREFIX, 'efs'), {type: 'efs'}, accountConfig);
            const dependencyDeployContext = new DeployContext(dependencyServiceContext);
            const containerConfigs = ecsContainers.getContainersConfig(serviceContext, [dependencyDeployContext], 'FakeClusterName');

            expect(getRoutingInfoStub.callCount).to.equal(1);
            expect(getMountPointsStub.callCount).to.equal(2);
            expect(containerConfigs.length).to.equal(2);
            expect(containerConfigs[0].name).to.equal('mycontainername');
        });
    });

    describe('checkContainers', () => {
        it('should return an error when no containers are specified', () => {
            serviceParams.containers = [];
            const errors: string[] = [];
            ecsContainers.checkContainers(serviceContext, 'Fargate', errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('You must specify at least one container');
        });

        it('should require contains to have a name', () => {
            delete serviceParams.containers[0].name;
            const errors: string[] = [];
            ecsContainers.checkContainers(serviceContext, 'Fargate', errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`The 'name' parameter is required`);
        });

        it('should only allow one container to have routing', () => {
            serviceParams.containers[1].routing = {
                base_path: '/'
            };
            serviceParams.containers[1].port_mappings = [
                5000
            ];
            const errors: string[] = [];
            ecsContainers.checkContainers(serviceContext, 'Fargate', errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`You may not specify a 'routing' section in more than one container.`);
        });

        it('should require port_mappings if routing is specified', () => {
            delete serviceParams.containers[0].port_mappings;
            const errors: string[] = [];
            ecsContainers.checkContainers(serviceContext, 'Fargate', errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`The 'port_mappings' parameter is required`);
        });

        it('should require container links to be valid', () => {
            serviceParams.containers = [ serviceParams.containers[0] ];
            const errors: string[] = [];
            ecsContainers.checkContainers(serviceContext, 'Fargate', errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`You specified a link`);
        });

        it('should return no errors for a proper configuration', () => {
            const errors: string[] = [];
            ecsContainers.checkContainers(serviceContext, 'Fargate', errors);
            expect(errors.length).to.equal(0);
        });
    });
});
