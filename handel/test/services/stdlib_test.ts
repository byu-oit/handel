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

import * as stdlib from '../../src/services/stdlib';

describe('Standard Library Extension', () => {
    it('Returns the standard lib extension', async () => {
        const extension = await stdlib.loadStandardLib();

        expect(extension).to.have.property('prefix', '__STDLIB__');
        expect(extension).to.have.property('name', 'handel-stdlib');
        expect(extension).to.have.property('instance');

    });
    it('loads all subdirectories of services/', async () => {
        const expectedServices = listDefaultServices();

        const extension = await stdlib.loadStandardLib();

        const instance = extension.instance;

        const fakeContext = new FakeExtensionContext();

        await instance.loadHandelExtension(fakeContext);

        expectedServices.forEach(f => {
            expect(fakeContext.services).to.haveOwnProperty(f);
        });
    });
});

class FakeExtensionContext implements ExtensionContext {
    public readonly services: { [k: string]: ServiceDeployer } = {};

    public service(name: string, deployer: ServiceDeployer) {
        this.services[name] = deployer;
        return this;
    }
}

function listDefaultServices() {
    const servicePath = path.resolve(__dirname, '../../src/services');
    const files = fs.readdirSync(servicePath);
    return files
        .filter(f => f !== '.')
        .filter(f => fs.statSync(path.join(servicePath, f)).isDirectory());
}
