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

import * as extension from '../../src/services/default-services-extension';

describe('Default Services Extension', () => {
    it('loads all subdirectories of services/', async () => {
        const ctx = new FakeExtensionContext();
        const expectedServices = listDefaultServices();

        await extension.loadHandelExtension(ctx);

        expectedServices.forEach(f => {
            expect(ctx.services).to.haveOwnProperty(path.dirname(f));
        });
    });
});

class FakeExtensionContext implements ExtensionContext {
    public readonly services: {[k: string]: ServiceDeployer} = {};

    public service(name: string, deployer: ServiceDeployer) {
        this.services[name] = deployer;
        return this;
    }
}

function listDefaultServices() {
    const servicePath = path.resolve(__dirname, '../../src/services');
    const files = fs.readdirSync(servicePath);
    return files.filter(f => fs.statSync(f).isDirectory());
}
