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
import 'mocha';
import * as sinon from 'sinon';
import * as cli from '../../src/cli';
import * as util from '../../src/common/util';
import { DeleteOptions, DeployOptions } from '../../src/datatypes';

describe('cli module', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('validateDeployArgs', () => {
        const handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
        it('should succeed if all params are provided', () => {
            const argv = {
                debug: false,
                linkExtensions: false,
                accountConfig: `${__dirname}/../test-account-config.yml`,
                environments: ['dev', 'prod'],
                tags: {foo: 'bar', bar: 'baz'},
            };
            const errors = cli.validateDeployArgs(handelFile, argv);
            expect(errors.length).to.equal(0);
        });

        it('should fail if there are invalid tags', () => {
            const argv = {
                debug: false,
                linkExtensions: false,
                environments: ['dev', 'prod'],
                accountConfig: `${__dirname}/../test-account-config.yml`,
                tags: {
                    foo: 'bar',
                    'bar': '',
                    'ab{}cd': 'abc'
                },
            };
            const errors = cli.validateDeployArgs(handelFile, argv);
            expect(errors).to.have.lengthOf(2);
            expect(errors).to.include(`The value for tag 'bar' must not be empty`);
            expect(errors).to.include(`The tag name is invalid: 'ab{}cd'`);
        });
    });

    describe('validateDeleteArgs', () => {
        const handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
        it('should succeed if all params are provided', () => {
            const argv = {
                debug: false,
                linkExtensions: false,
                environment: 'prod',
                accountConfig: `${__dirname}/../test-account-config.yml`,
                yes: true
            };
            const errors = cli.validateDeleteArgs(handelFile, argv as DeleteOptions);
            expect(errors.length).to.equal(0);
        });
    });
});
