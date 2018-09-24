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
import * as aiservices from '../../../src/services/aiservices';
import { AIServicesConfig } from '../../../src/services/aiservices/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('aiservices deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<AIServicesConfig>;
    let serviceParams: AIServicesConfig;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'aiservices',
            ai_services: [
                'rekognition'
            ]
        };
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 'aiservices'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should not allow invaid or unsupported ai services', () => {
            serviceParams.ai_services[0] = 'fake';
            const errors = aiservices.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`The 'ai_services' field must be a list of strings, containing 'rekognition', 'comprehend', or 'polly'`);
        });
    });

    describe('deploy', () => {
        it('should return a deploy context with the given policies', async () => {
            const preDeployContext = new PreDeployContext(serviceContext);
            const deployContext = await aiservices.deploy(serviceContext, preDeployContext, []);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.policies.length).to.equal(2);
        });
    });
});
