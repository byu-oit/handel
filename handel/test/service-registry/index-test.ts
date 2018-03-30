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
import { ServiceDeployer } from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import {SinonStub} from 'sinon';
import { DEFAULT_EXTENSION, initServiceRegistry } from '../../src/service-registry';
import {ExtensionLoader} from '../../src/service-registry/types';

const sandbox = sinon.createSandbox();

describe('Service Registry', () => {

    const fakeDeployerMap = new Map<string, ServiceDeployer>()
        .set('fake', {} as ServiceDeployer);

    afterEach(() => {
        sandbox.restore();
    });

    it('always loads the default prefix', async () => {
        const registry = await initServiceRegistry();

        expect(registry.allPrefixes()).to.have.keys(['__DEFAULT__']);
    });

    it('can get default services', async () => {
        const loader = sandbox.stub().resolves({
            meta: DEFAULT_EXTENSION,
            extension: {},
            services: fakeDeployerMap
        }) as SinonStub & ExtensionLoader;

        const registry = await initServiceRegistry([], loader);

        const found = registry.getService('__DEFAULT__', 'fake');
        // noinspection TsLint
        expect(found).to.eql(fakeDeployerMap.get('fake'));
    });
});
