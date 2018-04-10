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
import { UnPreDeployContext } from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import * as util from '../../src/common/util';
import { AccountConfig, DeleteOptions, HandelFile, ServiceContext, ServiceType } from '../../src/datatypes';
import * as handelFileParser from '../../src/handelfile/parser-v1';
import * as deleteLifecycle from '../../src/lifecycles/delete';
import * as unBindPhase from '../../src/phases/un-bind';
import * as unDeployPhase from '../../src/phases/un-deploy';
import * as unPreDeployPhase from '../../src/phases/un-pre-deploy';
import FakeServiceRegistry from '../service-registry/fake-service-registry';
import { STDLIB_PREFIX } from '../../src/services/stdlib';

describe('delete lifecycle module', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('delete', () => {
        it('should delete the application environment', async () => {
            const serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 'FakeType'), {type: 'FakeType'}, accountConfig);
            const unDeployServicesStub = sandbox.stub(unDeployPhase, 'unDeployServicesInLevel').returns({});
            const unBindServicesStub = sandbox.stub(unBindPhase, 'unBindServicesInLevel').returns({});
            const unPreDeployStub = sandbox.stub(unPreDeployPhase, 'unPreDeployServices').resolves({
                A: new UnPreDeployContext(serviceContext)
            });
            const serviceRegistry = new FakeServiceRegistry();
            const opts: DeleteOptions = { linkExtensions: false, yes: false, environment: 'dev', accountConfig: '' };
            const handelFile: HandelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
            const results = await deleteLifecycle.deleteEnv(accountConfig, handelFile, 'dev', handelFileParser, serviceRegistry, opts);
            expect(unPreDeployStub.callCount).to.equal(1);
            expect(unBindServicesStub.callCount).to.equal(2);
            expect(unDeployServicesStub.callCount).to.equal(2);
        });
    });
});
