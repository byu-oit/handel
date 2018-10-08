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
import { Extension } from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import { ExtensionList, ExtensionSource, HandelCoreOptions, NpmExtensionDefinition } from '../../src/datatypes';
import * as npmLoader from '../../src/extensions-support/npm-loader';
import { resolveExtensions } from '../../src/extensions-support/resolve-extensions';
import { STDLIB_PREFIX } from '../../src/services/stdlib';
import * as stdlib from '../../src/services/stdlib';

describe('resolve-extensions', () => {

    const sandbox = sinon.sandbox.create();

    afterEach(() => {
        sandbox.restore();
    });

    const fooDefinition: ExtensionList = [{
        source: ExtensionSource.NPM,
        spec: 'fake',
        prefix: 'foo',
        name: 'foo-extension',
        versionSpec: '*'
    } as NpmExtensionDefinition];

    const basicOptions: HandelCoreOptions = {
        linkExtensions: false,
    };

    describe('resolveExtensions', () => {
        it('Loads a list of extensions', async () => {
            const loader = {loadExtensions: sinon.stub()};

            loader.loadExtensions.resolves([{
                prefix: 'foo',
                name: 'foo-extension',
                instance: {} as Extension,
            }]);

            const loaded = await resolveExtensions(fooDefinition, basicOptions, loader, null);

            expect(loaded).to.have.lengthOf(1);
            expect(loaded).to.deep.include({
                prefix: 'foo',
                name: 'foo-extension',
                instance: {}
            });
        });
        it('loads the stdlib extension if a loader is passed', async () => {
            const loader = {loadExtensions: sinon.stub().resolves([])};

            const stdLib = sinon.stub().resolves({
                prefix: STDLIB_PREFIX,
                name: 'handel-stdlib',
                instance: {}
            });

            const loaded = await resolveExtensions(
                [], basicOptions,
                loader, stdLib
            );

            expect(loaded).to.have.lengthOf(1);
            expect(loaded).to.deep.include({
                prefix: STDLIB_PREFIX,
                name: 'handel-stdlib',
                instance: {}
            });
        });
        it('Uses NPM loader by default', async () => {
            const loader = {loadExtensions: sinon.stub()};
            const initStub = sandbox.stub(npmLoader, 'initNpmLoader')
                .returns(loader);
            loader.loadExtensions.resolves([{
                prefix: 'foo',
                name: 'foo-extension',
                instance: {} as Extension,
            }]);

            await resolveExtensions(fooDefinition, basicOptions);

            expect(initStub.callCount).to.equal(1);
        });
        it('Loads stdlib by default', async () => {
            const stdLibLoader = sinon.stub().resolves({
                prefix: STDLIB_PREFIX,
                name: 'handel-stdlib',
                instance: {}
            });
            const stdLibStub = sandbox.stub(stdlib, 'loadStandardLib')
                .returns(stdLibLoader);
            const loader = {loadExtensions: sinon.stub().resolves([])};

            await resolveExtensions(fooDefinition, basicOptions, loader);

            expect(stdLibStub.callCount).to.equal(1);
        });
    });

});
