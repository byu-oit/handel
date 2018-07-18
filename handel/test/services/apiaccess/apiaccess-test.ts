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
import {  AccountConfig, DeployContext, PreDeployContext, ServiceContext, ServiceType } from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as apiaccess from '../../../src/services/apiaccess';
import { APIAccessConfig } from '../../../src/services/apiaccess/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('apiaccess deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<APIAccessConfig>;
    let serviceParams: APIAccessConfig;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'apiaccess',
            aws_services: [
                'organizations',
                'ec2'
            ]
        };
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 'apiaccess'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    // At the moment, check only validates the JSON schema, so no tests here for that phase at the moment

    describe('deploy', () => {
        it('should return a deploy context with the given policies', async () => {
            const preDeployContext = new PreDeployContext(serviceContext);

            const deployContext = await apiaccess.deploy(serviceContext, preDeployContext, []);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.policies.length).to.equal(2);
        });
    });
});
