const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const s3Calls = require('../../lib/aws/s3-calls');
const sinon = require('sinon');
const fs = require('fs');

describe('s3Calls', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
        AWS.restore('S3');
    });

    describe('uploadFile', function() {
        it('should upload the file', function() {
            let filePath = `${__dirname}/test-upload-file.txt`;

            AWS.mock('S3', 'upload', Promise.resolve({}))

            return s3Calls.uploadFile('handel-fake-bucket', 'my-key', filePath)
                .then(uploadResponse => {
                    expect(uploadResponse).to.deep.equal({});
                });
        });
    });

    describe('createBucket', function() {
        it('should create the bucket', function() {
            AWS.mock('S3', 'createBucket', Promise.resolve({}));

            return s3Calls.createBucket("handel-fake-bucket", 'us-badregion-5')
                .then(bucket => {
                    expect(bucket).to.deep.equal({});
                })
        });
    });

    describe('getBucket', function() {
        it('should return the bucket if it exists', function() {
            let bucketName = "FakeBucket";

            AWS.mock('S3', 'listBuckets', Promise.resolve({
                Buckets: [{
                    Name: bucketName
                }]
            }));

            return s3Calls.getBucket(bucketName)
                .then(bucket => {
                    expect(bucket.Name).to.equal(bucketName);
                });
        });

        it('should return null if the bucket doesnt exist', function() {
            AWS.mock('S3', 'listBuckets', Promise.resolve({
                Buckets: []
            }));

            return s3Calls.getBucket("FakeBucket")
                .then(bucket => {
                    expect(bucket).to.be.null;
                });
        });
    });

    describe('createBucketIfNotExists', function() {
        it('should return the bucket if it exists', function() {
            let getBucketStub = sandbox.stub(s3Calls, 'getBucket').returns(Promise.resolve({}));
            let createBucketStub = sandbox.stub(s3Calls, 'createBucket').returns(Promise.resolve(null));

            return s3Calls.createBucketIfNotExists("FakeBucket")
                .then(bucket => {
                    expect(bucket).to.deep.equal({});
                    expect(getBucketStub.calledOnce).to.be.true;
                    expect(createBucketStub.notCalled).to.be.true;
                });
        });

        it('should create the bucket if it doesnt exist', function() {
            let getBucketStub = sandbox.stub(s3Calls, 'getBucket');
            getBucketStub.onCall(0).returns(Promise.resolve(null));
            getBucketStub.onCall(1).returns(Promise.resolve({}));
            let createBucketStub = sandbox.stub(s3Calls, 'createBucket').returns(Promise.resolve({}));

            return s3Calls.createBucketIfNotExists("FakeBucket")
                .then(bucket => {
                    expect(bucket).to.deep.equal({});
                    expect(getBucketStub.calledTwice).to.be.true;
                    expect(createBucketStub.calledOnce).to.be.true;
                });
        });
    });
});