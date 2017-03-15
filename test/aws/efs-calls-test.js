const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const efsCalls = require('../../lib/aws/efs-calls');
const sinon = require('sinon');

describe('efs calls', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('getFileSystem', function() {
        it('should return the file system if it exists', function() {
            let fileSystemId = "FakeID"
            AWS.mock('EFS', 'describeFileSystems', Promise.resolve({
                FileSystems: [{
                    FileSystemId: fileSystemId
                }]
            }));

            return efsCalls.getFileSystem("FakeToken")
                .then(fileSystem => {
                    expect(fileSystem.FileSystemId).to.equal(fileSystemId);
                    AWS.restore('EFS');
                });
        });

        it('should return null if the file system doesnt exist', function() {
            let fileSystemId = "FakeID"
            AWS.mock('EFS', 'describeFileSystems', Promise.resolve({
                FileSystems: []
            }));

            return efsCalls.getFileSystem("FakeToken")
                .then(fileSystem => {
                    expect(fileSystem).to.be.null;
                    AWS.restore('EFS');
                });
        });
    });

    describe('createFileSystem', function() {
        it('should create the file system', function() {
            let fileSystemId = "FakeID"
            AWS.mock('EFS', 'createFileSystem', Promise.resolve({}));
            sandbox.stub(efsCalls, 'getFileSystem').returns(Promise.resolve({
                FileSystemId: fileSystemId,
                LifeCycleState: 'available'
            }));
            AWS.mock('EFS', 'createTags', Promise.resolve({}));
            AWS.mock('EFS', 'createMountTarget', Promise.resolve({}));
            AWS.mock('EFS', 'describeMountTargets', Promise.resolve({
                MountTargets: [{
                    LifeCycleState: 'available'
                }]
            }));

            let creationToken = "FakeToken"
            return efsCalls.createFileSystem(creationToken, "generalPurpose", ['FakeSubnetId'], {GroupId: "FakeGroupId"})
                .then(fileSystem => {
                    expect(fileSystem.LifeCycleState).to.equal('available');
                    AWS.restore('EFS');
                });
        });
    });
})