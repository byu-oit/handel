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
const config = require('../../lib/account-config/account-config');
const defaultAccountConfig = require('../../lib/account-config/default-account-config');
const fs = require('fs');
const path = require('path');
const util = require('../../lib/common/util');
const sinon = require('sinon');

describe('account config module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('module function', function () {
        it('should obtain the default account config when requested', function () {
            let getDefaultAccountConfigStub = sandbox.stub(defaultAccountConfig, 'getDefaultAccountConfig').returns(Promise.resolve({}));

            return config(`default-us-east-1`)
                .then(accountConfig => {
                    expect(getDefaultAccountConfigStub.callCount).to.equal(1);
                    expect(accountConfig).to.deep.equal({});
                });
        });

        it('should throw an error when default account config fails', function () {
            let errMessage = "FakeMessage";
            let getDefaultAccountConfigStub = sandbox.stub(defaultAccountConfig, 'getDefaultAccountConfig').returns(Promise.reject(new Error(errMessage)));

            return config(`default-us-east-1`)
                .then(accountConfig => {
                    expect(true).to.be.false;
                })
                .catch(err => {
                    expect(getDefaultAccountConfigStub.callCount).to.equal(1);
                    expect(err.message).to.deep.equal(errMessage);
                });
        });

        it('should obtain account config from the given file', function() {
            let existsStub = sandbox.stub(fs, 'existsSync').returns(true);
            let resolveStub = sandbox.stub(path, 'resolve').returns("FakeAbsolutePath");
            let readYamlStub = sandbox.stub(util, 'readYamlFileSync').returns({
                account_id: 11111111111,
                region: 'us-west-2',
                vpc: 'vpc-ffffffff',
                public_subnets: ['subnet-aaaaaaaa'],
                private_subnets: ['subnet-bbbbbbbb'],
                data_subnets: ['subnet-cccccccc']
            });

            return config("FakePathToFile")
                .then(accountConfig => {
                    expect(accountConfig.region).to.equal('us-west-2');
                    expect(existsStub.callCount).to.equal(2);
                    expect(resolveStub.callCount).to.equal(1);
                    expect(readYamlStub.callCount).to.equal(1);
                })
        });

        it('should obtain the account config file from a base64-encoded string', function() {
            let accountConfig = "YWNjb3VudF9pZDogMTExMTExMTExMTENCnJlZ2lvbjogdXMtd2VzdC0yDQp2cGM6IHZwYy1mZmZmZmZmZg0KcHVibGljX3N1Ym5ldHM6DQotIHN1Ym5ldC1hYWFhYWFhYQ0KcHJpdmF0ZV9zdWJuZXRzOg0KLSBzdWJuZXQtYmJiYmJiYmINCmRhdGFfc3VibmV0czoNCi0gc3VibmV0LWNjY2NjY2Nj";
            return config(accountConfig)
                .then(accountConfig => {
                    expect(accountConfig.region).to.equal('us-west-2');
                });
        });
    });
});