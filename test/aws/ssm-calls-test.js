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
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const ssmCalls = require('../../dist/aws/ssm-calls');
const sinon = require('sinon');

describe('ssmCalls module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
        AWS.restore('SSM');
    });

    describe('storeParameter', function () {
        it('should add the given parameter to the store', function () {
            AWS.mock('SSM', 'putParameter', Promise.resolve({}));

            return ssmCalls.storeParameter("ParamName", "ParamType", "ParamValue")
                .then(response => {
                    expect(response).to.deep.equal({});
                })
        });
    });

    describe('deleteParameters', function() {
        it('should delete the list of parameters from the store', function() {
            AWS.mock('SSM', 'deleteParameter', Promise.resolve(true));

            return ssmCalls.deleteParameters(['Param1', 'Param1'])
                .then(success => {
                    expect(success).to.be.true;
                });
        });
    });
});