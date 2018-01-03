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
import * as childProcess from 'child_process';
import * as sinon from 'sinon';
import awsWrapper from '../../src/aws/aws-wrapper';
import * as s3Calls from '../../src/aws/s3-calls';

describe('s3Calls', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('deleteMatchingPrefix', () => {
        it('should delete file(s) from a bucket matching a prefix', async () => {
            const listObjectsStub = sandbox.stub(awsWrapper.s3, 'listObjectsV2').resolves({
                Name: 'FakeBucket',
                Contents: []
            });

            const data = await s3Calls.deleteMatchingPrefix('FakeBucket', 'FakePrefix');
            expect(data).to.equal(null);
            expect(listObjectsStub.callCount).to.equal(1);
        });
    });

    describe('uploadFile', () => {
        it('should upload the file', async () => {
            const filePath = `${__dirname}/test-upload-file.txt`;

            const uploadStub = sandbox.stub(awsWrapper.s3, 'upload').resolves({});

            const uploadResponse = await s3Calls.uploadFile('handel-fake-bucket', 'my-key', filePath)
            expect(uploadResponse).to.deep.equal({});
            expect(uploadStub.callCount).to.equal(1);
        });
    });

    describe('uploadDirectory', () => {
        // TODO - Add these back in
        // it('should upload the directory', function() {
        //     let execStub = sandbox.stub(childProcess, 'exec', function(cmd, callback) {
        //         callback(null, "somestdout", "");
        //     });

        //     return s3Calls.uploadDirectory("FakeBucket", "", "/path/to/fake/dir")
        //         .then(response => {
        //             expect(response).to.be.true;
        //             expect(execStub.callCount).to.equal(1);
        //         });
        // });

        // it('should return an error when the AWS CLI is not present', function() {
        //     let execStub = sandbox.stub(childProcess, 'exec', function(cmd, callback) {
        //         callback(new Error("command not found"), "", "somestderr");
        //     });

        //     return s3Calls.uploadDirectory("FakeBucket", "", "/path/to/fake/dir")
        //         .then(response => {
        //             expect(true).to.be.false; //Should not get here
        //         })
        //         .catch(err => {
        //             expect(err.message).to.include("requires you to have the Python AWS CLI installed");
        //             expect(execStub.callCount).to.equal(1);
        //         });
        // });

        // it('should return any other error', function() {
        //     let execStub = sandbox.stub(childProcess, 'exec', function(cmd, callback) {
        //         callback(new Error("some other error"), "", "somestderr");
        //     });

        //     return s3Calls.uploadDirectory("FakeBucket", "", "/path/to/fake/dir")
        //         .then(response => {
        //             expect(true).to.be.false; //Should not get here
        //         })
        //         .catch(err => {
        //             expect(err.message).to.eq("some other error");
        //             expect(execStub.callCount).to.equal(1);
        //         });
        // });
    });

    describe('listFilesByPrefix', () => {
        it('should return a list of objects when there are results', async () => {
            const listObjectsStub = sandbox.stub(awsWrapper.s3, 'listObjectsV2').resolves({
                Contents: [{
                    Key: 'FakeKey'
                }]
            });

            const objects = await s3Calls.listFilesByPrefix('FakeBucket', 'FakePrefix');
            expect(objects.length).to.equal(1);
            expect(listObjectsStub.callCount).to.equal(1);
        });

        it('should return an empty list when there are no results', async () => {
            const listObjectsStub = sandbox.stub(awsWrapper.s3, 'listObjectsV2').resolves({});

            const objects = await s3Calls.listFilesByPrefix('FakeBucket', 'FakePrefix')
            expect(objects.length).to.equal(0);
            expect(listObjectsStub.callCount).to.equal(1);
        });
    });

    describe('deleteFiles', () => {
        it('should delete the objects', async () => {
            const deleteObjectsStub = sandbox.stub(awsWrapper.s3, 'deleteObjects').resolves(true);

            const results = await s3Calls.deleteFiles('FakeBucket', [{ Key: 'FakeKey' }])
            expect(results).to.equal(true);
            expect(deleteObjectsStub.callCount).to.equal(1);
        });
    });

    describe('cleanupOldVersionsOfFiles', () => {
        it('should clean up versions of files older than 30 days, but keeping the 5 most recent', async () => {
            // 5 really old objects + 1 current object. The algorithm should keep the 1 current, plus the four most recent old ones
            const oldestDate = new Date(1000);
            const objects = [
                { LastModified: oldestDate },
                { LastModified: new Date(1001) },
                { LastModified: new Date(1002) },
                { LastModified: new Date(1003) },
                { LastModified: new Date(1004) },
                { LastModified: new Date() }
            ];

            const listObjectsStub = sandbox.stub(awsWrapper.s3, 'listObjectsV2').resolves({
                Contents: objects
            });
            const deleteObjectsStub = sandbox.stub(awsWrapper.s3, 'deleteObjects').returns(Promise.resolve({}));

            const result = await s3Calls.cleanupOldVersionsOfFiles('FakeBucket', 'FakePrefix');
            expect(result).to.deep.equal({});
            expect(listObjectsStub.callCount).to.equal(1);
            expect(deleteObjectsStub.callCount).to.equal(1);
        });
    });

    describe('createBucket', () => {
        it('should create the bucket', async () => {
            const createBucketStub = sandbox.stub(awsWrapper.s3, 'createBucket').resolves({});

            const bucket = await s3Calls.createBucket('handel-fake-bucket', 'us-badregion-5')
            expect(bucket).to.deep.equal({});
            expect(createBucketStub.callCount).to.equal(1);
        });
    });

    describe('getBucket', () => {
        it('should return the bucket if it exists', async () => {
            const bucketName = 'FakeBucket';

            const listBucketsStub = sandbox.stub(awsWrapper.s3, 'listBuckets').resolves({
                Buckets: [{
                    Name: bucketName
                }]
            });

            const bucket = await s3Calls.getBucket(bucketName);
            expect(bucket!.Name).to.equal(bucketName);
            expect(listBucketsStub.callCount).to.equal(1);
        });

        it('should return null if the bucket doesnt exist', async () => {
            const listBucketsStub = sandbox.stub(awsWrapper.s3, 'listBuckets').resolves({
                Buckets: []
            });

            const bucket = await s3Calls.getBucket('FakeBucket');
            expect(bucket).to.equal(null);
            expect(listBucketsStub.callCount).to.equal(1);
        });
    });

    describe('createBucketIfNotExists', () => {
        it('should return the bucket if it exists', async () => {
            const bucketName = 'FakeBucket';
            const listBucketsStub = sandbox.stub(awsWrapper.s3, 'listBuckets').resolves({
                Buckets: [{
                    Name: bucketName
                }]
            });

            const bucket = await s3Calls.createBucketIfNotExists(bucketName, 'us-west-1');
            expect(bucket).to.deep.equal({
                Name: bucketName
            });
            expect(listBucketsStub.callCount).to.equal(1);
        });

        it('should create the bucket if it doesnt exist', async () => {
            const bucketName = 'FakeBucket';
            const getBucketStub = sandbox.stub(awsWrapper.s3, 'listBuckets');
            getBucketStub.onCall(0).resolves({
                Buckets: []
            });
            getBucketStub.onCall(1).resolves({
                Buckets: [{
                    Name: bucketName
                }]
            });
            const createBucketStub = sandbox.stub(awsWrapper.s3, 'createBucket').resolves({});

            const bucket = await s3Calls.createBucketIfNotExists(bucketName, 'us-west-2');
            expect(bucket).to.deep.equal({
                Name: bucketName
            });
            expect(getBucketStub.callCount).to.equal(2);
            expect(createBucketStub.callCount).to.equal(1);
        });
    });
});
