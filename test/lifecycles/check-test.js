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
const checkLifecycle = require('../../dist/lifecycles/check');
const checkPhase = require('../../dist/phases/check');
const util = require('../../dist/common/util');
const sinon = require('sinon');
const expect = require('chai').expect;
const handelFileParser = require('../../dist/handelfile/parser-v1');

describe('check lifecycle module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should check the Handel file for errors', function () {
            let error = 'SomeService - Some error was found'
            let checkServicesStub = sandbox.stub(checkPhase, 'checkServices').returns([error])
            
            let serviceDeployers = util.getServiceDeployers();
            let handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
            handelFile.environments.dev.B.database_name = null; //Cause error
            let errors = checkLifecycle.check(handelFile, handelFileParser, serviceDeployers);
            expect(checkServicesStub.calledTwice).to.be.true;
            expect(errors.dev.length).to.equal(1);
            expect(errors.dev[0]).to.equal(error);
        });
    });
});