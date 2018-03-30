/*
 *  @license
 *    Copyright 2018 Brigham Young University
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */
import { expect } from 'chai';
import * as fs from 'fs-extra';
import { ExtensionContext, ServiceDeployer } from 'handel-extension-api';
import 'mocha';
import * as path from 'path';
import * as sinon from 'sinon';
import {SinonStub} from 'sinon';
import {ExtensionDefinition, ExtensionInstantiator, init} from '../../src/service-registry';

const sandbox = sinon.createSandbox();

describe('Service Registry', () => {

    const fakeDeployerMap = new Map<string, ServiceDeployer>()
        .set('fake', {} as ServiceDeployer);

    afterEach(() => {
        sandbox.restore();
    });

    it('always loads the default prefix', async () => {
        const registry = await init();

        expect(registry.validPrefixes()).to.have.keys(['__DEFAULT__']);
    });

    it('can get default services', async () => {
        const instantiator = sandbox.stub().resolves(fakeDeployerMap) as SinonStub & ExtensionInstantiator;

        const registry = await init([], instantiator);

        const found = await registry.findDeployerFor('__DEFAULT__', 'fake');
        // noinspection TsLint
        expect(found).to.eql(fakeDeployerMap.get('fake'));
    });
});
