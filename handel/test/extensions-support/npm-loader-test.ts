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
import { expect, use as extendChai } from 'chai';
import * as chaiPromised from 'chai-as-promised';
import * as fs from 'fs-extra';
import { Extension } from 'handel-extension-api';
import 'mocha';
import * as os from 'os';
import * as path from 'path';
import { SinonStub, SinonStubbedInstance } from 'sinon';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import {
    ExtensionInstallationError,
    ExtensionList,
    ExtensionLoadingError,
    HandelCoreOptions
} from '../../src/datatypes';
import { NpmClient } from '../../src/extensions-support/npm';
import { initNpmLoader, ModuleImporter } from '../../src/extensions-support/npm-loader';
import { STDLIB_PREFIX } from '../../src/services/stdlib';
import * as stdlib from '../../src/services/stdlib';

extendChai(sinonChai);
extendChai(chaiPromised);

// tslint:disable:no-unused-expression

describe('npm-loader', () => {
    const sandbox = sinon.sandbox.create();

    let baseDir: string;
    let extDir: string;
    let client: SinonStubbedInstance<NpmClient>;
    let importer: ModuleImporter & SinonStub;

    beforeEach(async () => {
        baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'handel-npm-loader-test-'));
        extDir = path.join(baseDir, '.handel-extensions');
        client = {
            installAll: sinon.stub().resolves(),
            listLinkedPackages: sinon.stub().resolves([]),
        };
        importer = sinon.stub().resolves();
    });

    afterEach(async () => {
        sandbox.restore();
        await fs.remove(baseDir);
    });

    const fooDefinition: ExtensionList = [{
        prefix: 'foo',
        name: 'foo-extension',
        versionSpec: '*'
    }];

    const basicOptions: HandelCoreOptions = {
        linkExtensions: false,
    };

    describe('loadExtensions', () => {
        it('does nothing if no definitions are passed', async () => {
            const loader = initNpmLoader(client, importer);
            const loaded = await loader.loadExtensions([], {linkExtensions: false}, extDir);

            expect(loaded).to.be.empty;

            expect(await fs.pathExists(extDir)).to.be.false;
        });
        it('creates .handel-extensions, if needed', async () => {
            const definitions = [{
                name: 'fake',
                prefix: 'fake',
                versionSpec: '*',
            }];
            const loader = initNpmLoader(client, importer);
            const loaded = await loader.loadExtensions(definitions, {linkExtensions: false}, extDir);

            expect(
                await fs.pathExists(extDir),
                '.handel-extensions should exist'
            ).to.be.true;
        });
        it('installs specified extensions', async () => {
            const definitions = [{
                name: 'fake',
                prefix: 'fake',
                versionSpec: '*',
            }];

            const expectedInstance = {};

            importer.resolves(expectedInstance);

            const loader = initNpmLoader(client, importer);
            const loaded = await loader.loadExtensions(definitions, {linkExtensions: false}, extDir);

            expect(loaded).to.have.lengthOf(1);
            expect(loaded).to.deep.include({name: 'fake', prefix: 'fake', instance: expectedInstance});

            expect(client.installAll).to.have.been.calledOnce;

            await expectModuleInPackage(extDir, 'fake', '*');
        });
        it('uses local links when requested', async () => {
            const definitions = [{
                name: 'fake',
                prefix: 'fake',
                versionSpec: '*',
            }];

            const linkPath = '/some/path/to/fake';

            client.listLinkedPackages.resolves([{name: 'fake', path: linkPath}]);

            const loader = initNpmLoader(client, importer);
            const loaded = await loader.loadExtensions(definitions, {linkExtensions: true}, extDir);

            expect(loaded).to.have.lengthOf(1);

            await expectModuleInPackage(extDir, 'fake', 'file:' + linkPath);
        });
        it('throws a pretty error when the install fails', async () => {
            const definitions = [{
                name: 'fake',
                prefix: 'fake',
                versionSpec: '*',
            }];

            const err: any = new Error();
            err.stderr = Buffer.from('output\noutput2', 'utf8');

            client.installAll.rejects(err);

            const loader = initNpmLoader(client, importer);
            await expect(loader.loadExtensions(definitions, {linkExtensions: false}, extDir))
                .to.be.rejectedWith(ExtensionInstallationError);
        });
        it('throws a pretty error when loading fails', async () => {
            const definitions = [{
                name: 'fake',
                prefix: 'fake',
                versionSpec: '*',
            }];

            importer.rejects(new Error('fake'));

            const loader = initNpmLoader(client, importer);
            await expect(loader.loadExtensions(definitions, {linkExtensions: false}, extDir))
                .to.be.rejectedWith(ExtensionLoadingError);
        });
    });

});

async function expectModuleInPackage(dir: string, name: string, version: string) {
    const packagePath = path.join(dir, 'package.json');

    expect(await fs.pathExists(packagePath), 'package.json should exist').to.be.true;

    const pack = await fs.readJSON(packagePath);
    expect(pack).to.haveOwnProperty('dependencies')
        .which.has.ownProperty(name, version);
}
