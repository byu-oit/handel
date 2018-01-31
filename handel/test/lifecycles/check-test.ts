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
import * as util from '../../src/common/util';
import * as handelFileParser from '../../src/handelfile/parser-v1';
import * as checkLifecycle from '../../src/lifecycles/check';
import * as checkPhase from '../../src/phases/check';

describe('check lifecycle module', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should check the Handel file for errors', () => {
            const error = 'SomeService - Some error was found';
            const checkServicesStub = sandbox.stub(checkPhase, 'checkServices').returns([error]);

            const serviceDeployers = util.getServiceDeployers();
            const handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
            handelFile.environments.dev.B.database_name = null; // Cause error
            const errors = checkLifecycle.check(handelFile, handelFileParser, serviceDeployers);
            expect(checkServicesStub.callCount).to.equal(2);
            expect(errors.dev.length).to.equal(1);
            expect(errors.dev[0]).to.equal(error);
        });
    });
});
