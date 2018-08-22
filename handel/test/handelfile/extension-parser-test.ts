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
import 'mocha';
import { allScmProviders, ExtensionSource } from '../../src/datatypes';
import * as parser from '../../src/handelfile/extension-parser';

describe('Extension Parser', () => {
    it(`can parse a 'file:' extensions`, () => {
        const result = parser.parseExtensionSpec('test', 'file:my/awesome/extension');
        // noinspection TsLint
        expect(result).to.exist;

        expect(result).to.contain({
            source: ExtensionSource.FILE,
            prefix: 'test',
            path: 'my/awesome/extension'
        });
    });
    it(`can parse a 'git:' extension`, () => {
         const result = parser.parseExtensionSpec('test', 'git:git+https://my-site.com/repo.git');
        // noinspection TsLint
        expect(result).to.exist;

        expect(result).to.contain({
            source: ExtensionSource.GIT,
            prefix: 'test',
            url: 'git+https://my-site.com/repo.git'
        });
    });
    describe('SCM providers', () => {
        allScmProviders.forEach(provider => {
            describe(provider, () => {
                it('Handles a basic spec', () => {
                    const result: any = parser.parseExtensionSpec('test', provider + ':owner/repo');

                    expect(result).to.contain({
                        source: ExtensionSource.SCM,
                        prefix: 'test',
                        provider,
                        owner: 'owner',
                        repo: 'repo'
                    });
                    expect(result.commitish).to.not.exist;
                });
                it('Handles a spec with a commitish value', () => {
                    const result = parser.parseExtensionSpec('test', provider + ':owner/repo#master');

                    expect(result).to.contain({
                        source: ExtensionSource.SCM,
                        prefix: 'test',
                        provider,
                        owner: 'owner',
                        repo: 'repo',
                        commitish: 'master'
                    });
                });
            });
        });
    });

    describe('npm extension', () => {
        it('handles a simple spec', () => {
            const prefix = 'test';
            const name = 'my-extension';
            const spec = name;
            const result = parser.parseExtensionSpec(prefix, spec);

            expect(result).to.deep.equal({
                source: ExtensionSource.NPM,
                prefix,
                spec,
                name,
                versionSpec: '*'
            });
        });
        it('handles a versioned spec', () => {
            const prefix = 'test';
            const name = 'my-extension';
            const versionSpec = '^0.0.0';
            const spec = `${name}@${versionSpec}`;
            const result = parser.parseExtensionSpec(prefix, spec);

            expect(result).to.deep.equal({
                source: ExtensionSource.NPM,
                prefix,
                spec,
                name,
                versionSpec
            });
        });
        it('Handles extensions with a scoped package name (issue #438)', async () => {
            const prefix = 'test';
            const name = '@my-org/my-extension';
            const spec = name;
            const result = parser.parseExtensionSpec(prefix, spec);

            expect(result).to.deep.equal({
                source: ExtensionSource.NPM,
                prefix,
                spec,
                name,
                versionSpec: '*',
            });
        });
        it('Handles extensions with a scoped package name and a version (issue #438)', async () => {
            const prefix = 'test';
            const name = '@my-org/my-extension';
            const versionSpec = '^0.0.0';
            const spec = `${name}@${versionSpec}`;
            const result = parser.parseExtensionSpec(prefix, spec);

            expect(result).to.deep.equal({
                source: ExtensionSource.NPM,
                prefix,
                spec,
                name,
                versionSpec
            });
        });
    });

});
