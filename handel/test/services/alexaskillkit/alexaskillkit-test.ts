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
import config from '../../../src/account-config/account-config';
import { AccountConfig, DeployContext, PreDeployContext, ProduceEventsContext, ServiceConfig, ServiceContext } from '../../../src/datatypes';
import * as alexaSkillKit from '../../../src/services/alexaskillkit';

describe('alexaskillkit deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<ServiceConfig>;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceContext = new ServiceContext('Fakepp', 'FakeEnv', 'FakeService', 'alexaskillkit', {type: 'alexaskillkit'}, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should return no errors', () => {
            const errors = alexaSkillKit.check(serviceContext, []);
            expect(errors.length).to.equal(0);
        });
    });

    describe('deploy', () => {
        it('should return an empty deploy context', async () => {
            const ownPreDeployContext = new PreDeployContext(serviceContext);
            const deployContext = await alexaSkillKit.deploy(serviceContext, ownPreDeployContext, []);
            expect(deployContext).to.be.instanceof(DeployContext);
        });
    });

    describe('produceEvents', () => {
        it('should return an empty produceEvents context', async () => {
            const ownDeployContext = new DeployContext(serviceContext);
            const consumerServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService2', 'lambda', {type: 'alexaskillkit'}, accountConfig);
            const consumerDeployContext = new DeployContext(consumerServiceContext);
            const eventConfigConsumer = {
                service_name: 'FakeService2'
            };
            const produceEventsContext = await alexaSkillKit.produceEvents(serviceContext, ownDeployContext, eventConfigConsumer, consumerServiceContext, consumerDeployContext);
            expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
        });
    });
});
