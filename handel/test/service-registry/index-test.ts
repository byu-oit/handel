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
import { Extension, ServiceDeployer } from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import { ExtensionLoadingError, MissingDeployerError, MissingPrefixError } from '../../src/datatypes';
import { initServiceRegistry } from '../../src/service-registry';
import {FakeExtension} from './fake-extension';

extendChai(chaiPromised);

const sandbox = sinon.createSandbox();

describe('Service Registry', () => {

    const fakeDeployers = {
        foo: {} as ServiceDeployer,
        bar: {} as ServiceDeployer,
    };

    afterEach(() => {
        sandbox.restore();
    });

    describe('initServiceRegistry', () => {
        it('Returns an initialized registry', async () => {
            const fakeExtensions = [{
                prefix: 'fake',
                name: 'fake-extension',
                instance: new FakeExtension(fakeDeployers)
            }];

            const registry = await initServiceRegistry(fakeExtensions);
            // tslint:disable-next-line:no-unused-expression
            expect(registry).to.not.be.null;

            expect(registry).to.have.property('getService')
                .which.is.a('function');
            expect(registry).to.have.property('hasService')
                .which.is.a('function');
            expect(registry).to.have.property('allPrefixes')
                .which.is.a('function');
        });
        it('throws an ExtensionLoadingError if anything goes wrong', async () => {
            const extension: Extension = {
                loadHandelExtension: sinon.stub()
                    .rejects()
            };
            const loaded = [{
                prefix: 'fake',
                name: 'fake-extension',
                instance: extension,
            }];

            await expect(initServiceRegistry(loaded))
                .to.be.rejectedWith(ExtensionLoadingError);
        });
    });
    describe('service registry instance', () => {
        const fakeExtensions = [{
            prefix: 'fake',
            name: 'fake-extension',
            instance: new FakeExtension(fakeDeployers)
        }];

        describe('getService', () => {
            it('Gets a service from a prefix and a name', async () => {
                const registry = await initServiceRegistry(fakeExtensions);

                const svc = registry.getService('fake', 'foo');
                expect(svc).to.equal(fakeDeployers.foo);
            });
            it('Errors if given a bad prefix', async () => {
                const registry = await initServiceRegistry(fakeExtensions);

                expect(() => registry.getService('invalid', 'foo'))
                    .to.throw(MissingPrefixError);
            });
            it('Errors if given a good prefix but a bad service name', async () => {
                const registry = await initServiceRegistry(fakeExtensions);

                expect(() => registry.getService('fake', 'invalid'))
                    .to.throw(MissingDeployerError);
            });
        });
    });
});
