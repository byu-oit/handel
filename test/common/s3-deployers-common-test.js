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
const s3DeployersCommon = require('../../dist/common/s3-deployers-common');
const ServiceContext = require('../../dist/datatypes/service-context').ServiceContext;
const deployPhaseCommon = require('../../dist/common/deploy-phase-common');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../dist/account-config/account-config');

describe('S3 deployers common module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('createLoggingBucketIfNotExists', function () {
        it('should deploy the logging bucket', function () {
            let bucketName = "FakeBucket";
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'BucketName',
                    OutputValue: bucketName
                }]
            }));

            return config(`${__dirname}/../test-account-config.yml`)
                .then(accountConfig => {
                    return s3DeployersCommon.createLoggingBucketIfNotExists(accountConfig)
                        .then(returnBucketName => {
                            expect(returnBucketName).to.equal(bucketName);
                            expect(deployStackStub.callCount).to.equal(1);
                        })
                });
        });
    });

    describe('getLogFilePrefix', function () {
        it('should return the proper s3 prefix', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", {});
            let prefix = s3DeployersCommon.getLogFilePrefix(serviceContext);
            expect(prefix).to.equal('FakeApp/FakeEnv/FakeService/');
        });
    });
});