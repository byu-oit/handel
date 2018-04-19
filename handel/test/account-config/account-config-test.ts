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
import * as fs from 'fs';
import 'mocha';
import * as path from 'path';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import * as defaultAccountConfig from '../../src/account-config/default-account-config';
import * as util from '../../src/common/util';

describe('account config module', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('module function', () => {
        it('should obtain the default account config when requested', async () => {
            const getDefaultAccountConfigStub = sandbox.stub(defaultAccountConfig, 'getDefaultAccountConfig').resolves({});

            const accountConfig = await config(`default-us-east-1`);
            expect(getDefaultAccountConfigStub.callCount).to.equal(1);
            expect(accountConfig).to.deep.equal({});
        });

        it('should obtain account config from the given file', async () => {
            const existsStub = sandbox.stub(fs, 'existsSync').returns(true);
            const resolveStub = sandbox.stub(path, 'resolve').returns('FakeAbsolutePath');
            const readYamlStub = sandbox.stub(util, 'readYamlFileSync').returns({
                account_id: '11111111111',
                region: 'us-west-2',
                vpc: 'vpc-ffffffff',
                public_subnets: ['subnet-aaaaaaaa'],
                private_subnets: ['subnet-bbbbbbbb'],
                data_subnets: ['subnet-cccccccc']
            });

            const accountConfig = await config('FakePathToFile');
            expect(accountConfig.region).to.equal('us-west-2');
            expect(existsStub.callCount).to.equal(2);
            expect(readYamlStub.callCount).to.equal(1);
        });

        it('should obtain the account config file from a base64-encoded string', async () => {
            const accountConfig = 'YWNjb3VudF9pZDogMTExMTExMTExMTENCnJlZ2lvbjogdXMtd2VzdC0yDQp2cGM6IHZwYy1mZmZmZmZmZg0KcHVibGljX3N1Ym5ldHM6DQotIHN1Ym5ldC1hYWFhYWFhYQ0KcHJpdmF0ZV9zdWJuZXRzOg0KLSBzdWJuZXQtYmJiYmJiYmINCmRhdGFfc3VibmV0czoNCi0gc3VibmV0LWNjY2NjY2Nj';
            const retAccountConfig = await config(accountConfig);
            expect(retAccountConfig.region).to.equal('us-west-2');
        });
    });
});
