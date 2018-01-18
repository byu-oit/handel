/*
 * Copyright 2017 Brigham Young University
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
import * as sinon from 'sinon';
import * as cli from '../../dist/cli';
import * as util from '../../dist/common/util';

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
        it('should fail if the -c param is not provided', () => {
            const argv = {
                e: 'dev,prod'
            };
            const errors = cli.validateDeployArgs(argv, handelFile);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'-c' parameter is required`);
        });

        it('should fail if the -e parameter is not provided', () => {
            const argv = {
                c: `${__dirname}/../test-account-config.yml`
            };
            const errors = cli.validateDeployArgs(argv, handelFile);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'-e' parameter is required`);
        });

        it('should suceed if all params are provided', () => {
            const argv = {
                e: 'dev,prod',
                c: `${__dirname}/../test-account-config.yml`
            };
            const errors = cli.validateDeployArgs(argv, handelFile);
            expect(errors.length).to.equal(0);
        });
    });

    describe('validateDeleteArgs', () => {
        const handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
        it('should fail if the -c param is not provided', () => {
            const argv = {
                e: 'dev,prod'
            };
            const errors = cli.validateDeleteArgs(argv, handelFile);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'-c' parameter is required`);
        });

        it('should fail if the -e parameter is not provided', () => {
            const argv = {
                c: `${__dirname}/../test-account-config.yml`
            };
            const errors = cli.validateDeleteArgs(argv, handelFile);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'-e' parameter is required`);
        });

        it('should succeed if all params are provided', () => {
            const argv = {
                e: 'dev,prod',
                c: `${__dirname}/../test-account-config.yml`
            };
            const errors = cli.validateDeleteArgs(argv, handelFile);
            expect(errors.length).to.equal(0);
        });
    });
});
