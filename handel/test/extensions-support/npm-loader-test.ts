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
import 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import { SinonStub, SinonStubbedInstance } from 'sinon';
import * as sinonChai from 'sinon-chai';
import {
    ExtensionDefinition,
    ExtensionInstallationError,
    ExtensionList,
    ExtensionLoadingError,
    ExtensionSource,
    FileExtensionDefinition,
    GitExtensionDefinition,
    HandelCoreOptions,
    NpmExtensionDefinition,
    ScmExtensionDefinition,
    ScmProvider
} from '../../src/datatypes';
import { NpmClient } from '../../src/extensions-support/npm';
import { initNpmLoader, ModuleImporter } from '../../src/extensions-support/npm-loader';

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
        source: ExtensionSource.NPM,
        name: 'foo-extension',
        versionSpec: '*'
    } as NpmExtensionDefinition];

    const basicOptions: HandelCoreOptions = {
        linkExtensions: false,
    };

    describe('loadExtensions', () => {
        it('does nothing if no definitions are passed', async () => {
            const loader = initNpmLoader(client, importer);
            const loaded = await loader.loadExtensions([], {linkExtensions: false}, baseDir);

            expect(loaded).to.be.empty;

            expect(await fs.pathExists(extDir)).to.be.false;
        });
        it('creates .handel-extensions, if needed', async () => {
            const definitions = [{
                source: ExtensionSource.NPM,
                spec: 'fake',
                name: 'fake',
                prefix: 'fake',
                versionSpec: '*',
            }];
            const loader = initNpmLoader(client, importer);
            const loaded = await loader.loadExtensions(definitions, {linkExtensions: false}, baseDir);

            expect(
                await fs.pathExists(extDir),
                '.handel-extensions should exist'
            ).to.be.true;
        });
        it('installs specified extensions', async () => {
            const gitUrl = 'git+https://foo.com/repo.git';
            await fs.emptyDir(path.join(baseDir, 'test'));
            const definitions: ExtensionDefinition[] = [
                {
                    source: ExtensionSource.NPM,
                    spec: 'fake',
                    name: 'fake',
                    prefix: 'npm',
                    versionSpec: '*',
                } as NpmExtensionDefinition,
                {
                    source: ExtensionSource.SCM,
                    provider: ScmProvider.GITHUB,
                    spec: 'github:fake/fake',
                    owner: 'fake',
                    repo: 'fake',
                    prefix: 'scm'
                } as ScmExtensionDefinition,
                {
                    source: ExtensionSource.FILE,
                    spec: 'file:test',
                    path: 'test',
                    prefix: 'file'
                } as FileExtensionDefinition,
                {
                    source: ExtensionSource.GIT,
                    spec: 'git:' + gitUrl,
                    url: gitUrl,
                    prefix: 'git'
                } as GitExtensionDefinition
            ];

            const expectedInstance = {};

            client.installAll.resolves([
                {name: 'fake', version: '^1.0.0'},
                {name: 'fake-gh', version: 'github:fake/fake'},
                {name: 'test', version: 'file:../test'},
                {name: 'git', version: gitUrl}
            ]);

            importer.resolves(expectedInstance);

            const loader = initNpmLoader(client, importer);
            const loaded = await loader.loadExtensions(definitions, {linkExtensions: false}, baseDir);

            expect(loaded).to.have.lengthOf(4);
            expect(loaded).to.deep.include({name: 'fake', prefix: 'npm', instance: expectedInstance});
            expect(loaded).to.deep.include({name: 'fake-gh', prefix: 'scm', instance: expectedInstance});
            expect(loaded).to.deep.include({name: 'test', prefix: 'file', instance: expectedInstance});
            expect(loaded).to.deep.include({name: 'git', prefix: 'git', instance: expectedInstance});

            expect(client.installAll).to.have.been.calledOnce;
            const args = client.installAll.firstCall.args;
            const specs = args[1];
            expect(specs).to.include('fake@*');
            expect(specs).to.include('github:fake/fake');
            expect(specs).to.include('file:../test');
            expect(specs).to.include('git+https://foo.com/repo.git');
        });
        it('uses local links when requested', async () => {
            const definitions = [{
                source: ExtensionSource.NPM,
                spec: 'fake',
                name: 'fake',
                prefix: 'fake',
                versionSpec: '*',
            }];

            const linkPath = '/some/path/to/fake';

            client.listLinkedPackages.resolves([{name: 'fake', path: linkPath}]);

            const loader = initNpmLoader(client, importer);
            const loaded = await loader.loadExtensions(definitions, {linkExtensions: true}, baseDir);

            expect(loaded).to.have.lengthOf(1);

            const args = client.installAll.firstCall.args;
            const specs = args[1];
            expect(specs).to.include('file:' + linkPath);
        });
        it('throws a pretty error when the install fails', async () => {
            const definitions = [{
                source: ExtensionSource.NPM,
                spec: 'fake',
                name: 'fake',
                prefix: 'fake',
                versionSpec: '*',
            }];

            const err: any = new Error();
            err.stderr = Buffer.from('output\noutput2', 'utf8');

            client.installAll.rejects(err);

            const loader = initNpmLoader(client, importer);
            await expect(loader.loadExtensions(definitions, {linkExtensions: false}, baseDir))
                .to.be.rejectedWith(ExtensionInstallationError);
        });
        it('throws a pretty error when loading fails', async () => {
            const definitions = [{
                source: ExtensionSource.NPM,
                spec: 'fake',
                name: 'fake',
                prefix: 'fake',
                versionSpec: '*',
            }];

            importer.rejects(new Error('fake'));

            const loader = initNpmLoader(client, importer);
            await expect(loader.loadExtensions(definitions, {linkExtensions: false}, baseDir))
                .to.be.rejectedWith(ExtensionLoadingError);
        });
        // describe('\'file:\' extensions', () => {
        //     it('can handle local \'file:\' extensions', async () => {
        //         const definitions = [{
        //             source: ExtensionSource.NPM,
        //             spec: 'fake',
        //             name: 'fake',
        //             prefix: 'fake',
        //             versionSpec: 'file:test'
        //         }];
        //
        //         await fs.ensureDir(path.join(baseDir, 'test'));
        //
        //         const expectedInstance = {};
        //
        //         importer.resolves(expectedInstance);
        //
        //         const loader = initNpmLoader(client, importer);
        //         const loaded = await loader.loadExtensions(definitions, {linkExtensions: false}, baseDir);
        //
        //         expect(loaded).to.have.lengthOf(1);
        //         expect(loaded).to.deep.include({name: 'fake', prefix: 'fake', instance: expectedInstance});
        //
        //         expect(client.installAll).to.have.been.calledOnce;
        //
        //         await expectModuleInPackage(extDir, 'fake', 'file:../test');
        //     });
        //     it('handles ./ - style paths', async () => {
        //         const definitions = [{
        //             source: ExtensionSource.NPM,
        //             spec: 'fake',
        //             name: 'fake',
        //             prefix: 'fake',
        //             versionSpec: 'file:./test'
        //         }];
        //
        //         await fs.ensureDir(path.join(baseDir, 'test'));
        //
        //         const expectedInstance = {};
        //
        //         importer.resolves(expectedInstance);
        //
        //         const loader = initNpmLoader(client, importer);
        //         const loaded = await loader.loadExtensions(definitions, {linkExtensions: false}, baseDir);
        //
        //         await expectModuleInPackage(extDir, 'fake', 'file:../test');
        //     });
        //     it('fails if the path is a relative path outside of the project root', async () => {
        //         const definitions = [{
        //             name: 'fake',
        //             prefix: 'fake',
        //             versionSpec: 'file:../bad',
        //         }];
        //
        //         const loader = initNpmLoader(client, importer);
        //         await expect(loader.loadExtensions(definitions, {linkExtensions: false}, baseDir))
        //             .to.be.rejectedWith(InvalidExtensionSpecificationError, /path outside of the project root/);
        //     });
        //     it('fails if the path is an absolute path', async () => {
        //         const definitions = [{
        //             name: 'fake',
        //             prefix: 'fake',
        //             versionSpec: 'file:/etc/passwd',
        //         }];
        //
        //         const loader = initNpmLoader(client, importer);
        //         await expect(loader.loadExtensions(definitions, {linkExtensions: false}, baseDir))
        //             .to.be.rejectedWith(InvalidExtensionSpecificationError, /absolute path/);
        //     });
        //     it('fails if the path is a Windows-style absolute path', async () => {
        //         const definitions = [{
        //             name: 'fake',
        //             prefix: 'fake',
        //             versionSpec: 'file:C:\\\\etc\\passwd',
        //         }];
        //
        //         const loader = initNpmLoader(client, importer);
        //         await expect(loader.loadExtensions(definitions, {linkExtensions: false}, baseDir))
        //             .to.be.rejectedWith(InvalidExtensionSpecificationError, /absolute path/);
        //     });
        //     it('fails if the path does not exist', async () => {
        //         const definitions = [{
        //             name: 'fake',
        //             prefix: 'fake',
        //             versionSpec: 'file:does-not-exist',
        //         }];
        //
        //         const loader = initNpmLoader(client, importer);
        //         await expect(loader.loadExtensions(definitions, {linkExtensions: false}, baseDir))
        //             .to.be.rejectedWith(InvalidExtensionSpecificationError, /path does not exist or is not readable/);
        //     });
        //     it('fails if the path is not a directory', async () => {
        //         const definitions = [{
        //             name: 'fake',
        //             prefix: 'fake',
        //             versionSpec: 'file:is-a-file',
        //         }];
        //
        //         await fs.ensureFile(path.join(baseDir, 'is-a-file'));
        //
        //         const loader = initNpmLoader(client, importer);
        //         await expect(loader.loadExtensions(definitions, {linkExtensions: false}, baseDir))
        //             .to.be.rejectedWith(InvalidExtensionSpecificationError, /must resolve to a directory/);
        //     });
        // });
    });

});

async function expectModuleInPackage(dir: string, name: string, version: string) {
    const packagePath = path.join(dir, 'package.json');

    expect(await fs.pathExists(packagePath), 'package.json should exist').to.be.true;

    const pack = await fs.readJSON(packagePath);
    console.log(pack);
    expect(pack).to.haveOwnProperty('dependencies')
        .which.has.ownProperty(name, version);
}
