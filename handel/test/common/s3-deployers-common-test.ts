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
import { AccountConfig, ServiceContext, ServiceType } from 'handel-extension-api';
import * as extensionSupport from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import * as deployPhaseCommon from '../../src/common/deploy-phase-common';
import * as s3DeployersCommon from '../../src/common/s3-deployers-common';
import { STDLIB_PREFIX } from '../../src/services/stdlib';

describe('S3 deployers common module', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('createLoggingBucketIfNotExists', () => {
        it('should deploy the logging bucket', async () => {
            const bucketName = 'FakeBucket';
            const deployStackStub = sandbox.stub(extensionSupport.deployPhase, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'BucketName',
                    OutputValue: bucketName
                }]
            }));

            const returnBucketName = await s3DeployersCommon.createLoggingBucketIfNotExists(accountConfig);
            expect(returnBucketName).to.equal(bucketName);
            expect(deployStackStub.callCount).to.equal(1);
        });
    });

    describe('getLogFilePrefix', () => {
        it('should return the proper s3 prefix', () => {
            const serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 'FakeType'), {type: 'FakeType'}, accountConfig);
            const prefix = s3DeployersCommon.getLogFilePrefix(serviceContext);
            expect(prefix).to.equal('FakeApp/FakeEnv/FakeService/');
        });
    });
});
