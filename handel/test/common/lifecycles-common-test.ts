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
    DeployContext,
    PreDeployContext,
    ServiceConfig,
    ServiceContext,
    ServiceType,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import * as lifecyclesCommon from '../../src/common/lifecycles-common';
import { STDLIB_PREFIX } from '../../src/services/stdlib';

describe('lifecycles common module', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;
    let serviceContext: ServiceContext<ServiceConfig>;

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 'FakeType'), {type: 'FakeType'}, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('preDeployNotRequired', () => {
        it('should return an empty predeploy context', async () => {
            const preDeployContext = await lifecyclesCommon.preDeployNotRequired(serviceContext);
            expect(preDeployContext).to.be.instanceof(PreDeployContext);
        });
    });

    describe('bindNotRequired', () => {
        it('should return an empty bind context', async () => {
            const appName = 'FakeApp';
            const envName = 'FakeEnv';
            const ownServiceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'efs'), {type: 'efs'}, accountConfig);
            const dependentOfServiceContext = new ServiceContext(appName, envName, 'FakeDependentService', new ServiceType(STDLIB_PREFIX, 'ecs'), {type: 'ecs'}, accountConfig);

            const bindContext = await lifecyclesCommon.bindNotRequired(ownServiceContext, dependentOfServiceContext);
            expect(bindContext).to.be.instanceof(BindContext);
        });
    });

    describe('deployNotRequired', () => {
        it('should return an empty deploy context', async () => {
            const deployContext = await lifecyclesCommon.deployNotRequired(serviceContext);
            expect(deployContext).to.be.instanceof(DeployContext);
        });
    });

    describe('unPreDeployNotRequired', () => {
        it('should return an empty UnPreDeployContext', async () => {
            const unPreDeployContext = await lifecyclesCommon.unPreDeployNotRequired(serviceContext);
            expect(unPreDeployContext).to.be.instanceOf(UnPreDeployContext);
        });
    });

    describe('unBindNotRequired', () => {
        it('should return an emtpy UnBindContext', async () => {
            const unBindContext = await lifecyclesCommon.unBindNotRequired(serviceContext);
            expect(unBindContext).to.be.instanceof(UnBindContext);
        });
    });

    describe('unDeployNotRequired', () => {
        it('should return an emtpy UnDeployContext', async () => {
            const unDeployContext = await lifecyclesCommon.unDeployNotRequired(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
        });
    });
});
