const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const sqsCalls = require('../../lib/aws/sqs-calls');
const sinon = require('sinon');

describe('sqsCalls', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
        AWS.restore('SQS');
    });

    describe('addSqsPermission', function () {
        it('should add the permission to an existing policy doc if there is one', function () {
            AWS.mock('SQS', 'getQueueAttributes', Promise.resolve({
                Attributes: {
                    Policy: '{"Statement": []}'
                }
            }));

            AWS.mock('SQS', 'setQueueAttributes', Promise.resolve({}));

            return sqsCalls.addSqsPermission("FakeUrl", "FakeArn", "FakeSourceArn", {})
                .then(response => {
                    expect(response).to.deep.equal({});
                });
        });

        it('should add a new policy doc with the permission if there isnt one yet', function () {
            AWS.mock('SQS', 'getQueueAttributes', Promise.resolve({
                Attributes: {}
            }));

            AWS.mock('SQS', 'setQueueAttributes', Promise.resolve({}));

            return sqsCalls.addSqsPermission("FakeUrl", "FakeArn", "FakeSourceArn", {})
                .then(response => {
                    expect(response).to.deep.equal({});
                });
        });
    });

    describe('getSqsPermission', function () {
        it('should return the permission if present in the policy doc', function () {
            let queueArn = "FakeQueueArn";
            let producerArn = "FakeTopicArn";
            AWS.mock('SQS', 'getQueueAttributes', Promise.resolve({
                Attributes: {
                    Policy: `{"Statement": [{"Effect": "Allow","Principal": "*","Action":"sqs:SendMessage","Resource":"${queueArn}","Condition":{"ArnEquals":{"aws:SourceArn": "${producerArn}"}}}]}`
                }
            }));

            let permissionToGet = {
                Effect: "Allow",
                Principal: "*",
                Action: "sqs:SendMessage",
                Resource: queueArn,
                Condition: {
                    ArnEquals: {
                        "aws:SourceArn": producerArn
                    }
                }
            }

            return sqsCalls.getSqsPermission("FakeQueueUrl", permissionToGet)
                .then(returnedPermission => {
                    expect(returnedPermission).to.deep.equal(permissionToGet);
                });
        });

        it('should return null when the permission is not present in the policy doc', function () {
            let queueArn = "FakeQueueArn";
            let producerArn = "FakeTopicArn";
            AWS.mock('SQS', 'getQueueAttributes', Promise.resolve({
                Attributes: {
                    Policy: `{"Statement": [{"Effect": "Allow","Principal": "*","Action":"sqs:SendMessage","Resource":"SomeOtherArn","Condition":{"ArnEquals":{"aws:SourceArn": "${producerArn}"}}}]}`
                }
            }));

            let permissionToGet = {
                Effect: "Allow",
                Principal: "*",
                Action: "sqs:SendMessage",
                Resource: queueArn,
                Condition: {
                    ArnEquals: {
                        "aws:SourceArn": producerArn
                    }
                }
            }

            return sqsCalls.getSqsPermission("FakeQueueUrl", permissionToGet)
                .then(returnedPermission => {
                    expect(returnedPermission).to.equal(null);
                });
        });

        it('should return null when there is no policy doc', function () {
            let queueArn = "FakeQueueArn";
            let producerArn = "FakeTopicArn";
            AWS.mock('SQS', 'getQueueAttributes', Promise.resolve({
                Attributes: {}
            }));

            let permissionToGet = {
                Effect: "Allow",
                Principal: "*",
                Action: "sqs:SendMessage",
                Resource: queueArn,
                Condition: {
                    ArnEquals: {
                        "aws:SourceArn": producerArn
                    }
                }
            }

            return sqsCalls.getSqsPermission("FakeQueueUrl", permissionToGet)
                .then(returnedPermission => {
                    expect(returnedPermission).to.equal(null);
                });
        });
    });

    describe('addSqsPermissionIfNotExists', function () {
        it('should add the permission if it doesnt exist', function () {
            let getSqsPermissionStub = sandbox.stub(sqsCalls, 'getSqsPermission');
            getSqsPermissionStub.onFirstCall().returns(Promise.resolve(null));
            getSqsPermissionStub.onSecondCall().returns(Promise.resolve({}));
            let addSqsPermissionStub = sandbox.stub(sqsCalls, 'addSqsPermission').returns(Promise.resolve({}));

            return sqsCalls.addSqsPermissionIfNotExists("FakeQueueUrl", "FakeQueueArn", "FakeTopicArn", {})
                .then(permission => {
                    expect(getSqsPermissionStub.calledTwice).to.be.true;
                    expect(addSqsPermissionStub.calledOnce).to.be.true;
                    expect(permission).to.deep.equal({});
                });
        });

        it('should return the permission if it already exists', function () {
            let getSqsPermissionStub = sandbox.stub(sqsCalls, 'getSqsPermission').returns(Promise.resolve({}));
            let addSqsPermissionStub = sandbox.stub(sqsCalls, 'addSqsPermission').returns(Promise.resolve({}));

            return sqsCalls.addSqsPermissionIfNotExists("FakeQueueUrl", "FakeQueueArn", "FakeTopicArn", {})
                .then(permission => {
                    expect(getSqsPermissionStub.calledOnce).to.be.true;
                    expect(addSqsPermissionStub.notCalled).to.be.true;
                    expect(permission).to.deep.equal({});
                });
        });
    });
});