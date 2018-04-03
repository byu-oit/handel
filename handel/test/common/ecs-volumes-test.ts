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
import * as ecsVolumes from '../../src/common/ecs-volumes';
import { AccountConfig, ServiceContext, ServiceType } from '../../src/datatypes';
import { FargateServiceConfig } from '../../src/services/ecs-fargate/config-types';
import { STDLIB_PREFIX } from '../../src/services/stdlib';

describe('ecs volumes common module', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;
    let serviceContext: ServiceContext<FargateServiceConfig>;
    let serviceParams: FargateServiceConfig;
    let dependenciesDeployContexts: DeployContext[];
    const appName = 'FakeApp';
    const envName = 'FakeEnv';

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
        serviceParams = {
            type: 'ecsfargate',
            containers: [
                {
                    name: 'mycontainername',
                }
            ],
            auto_scaling: {
                min_tasks: 1,
                max_tasks: 1
            }
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'ecsfargate'), serviceParams, accountConfig);

        dependenciesDeployContexts = [];
        const dependencyServiceContext1 = new ServiceContext(appName, envName, 'MyTopic', new ServiceType(STDLIB_PREFIX, 'sns'), {type: 'sns'}, accountConfig);
        const dependencyDeployContext1 = new DeployContext(dependencyServiceContext1);
        const dependencyServiceContext2 = new ServiceContext(appName, envName, 'MyEfs', new ServiceType(STDLIB_PREFIX, 'efs'), {type: 'efs'}, accountConfig);
        const dependencyDeployContext2 = new DeployContext(dependencyServiceContext2);
        dependencyDeployContext2.environmentVariables.MYEFS_MOUNT_DIR = 'path/to/mount/dir';
        dependenciesDeployContexts.push(dependencyDeployContext1);
        dependenciesDeployContexts.push(dependencyDeployContext2);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getVolumes', () => {
        it('should return volume config from any relevent dependencies', () => {
            const volumeConfigs = ecsVolumes.getVolumes(dependenciesDeployContexts);
            expect(volumeConfigs!.length).to.equal(1);
            expect(volumeConfigs![0].sourcePath).to.equal('path/to/mount/dir');
            expect(volumeConfigs![0].name).to.equal('MYEFS_MOUNT_DIR');
        });
    });

    describe('getMountPointsForContainer', () => {
        it('should return mount points configs for any relevant dependencies', () => {
            const mountPointConfigs = ecsVolumes.getMountPointsForContainer(dependenciesDeployContexts);
            expect(mountPointConfigs!.length).to.equal(1);
            expect(mountPointConfigs![0].containerPath).to.equal('path/to/mount/dir');
            expect(mountPointConfigs![0].sourceVolume).to.equal('MYEFS_MOUNT_DIR');
        });
    });
});
