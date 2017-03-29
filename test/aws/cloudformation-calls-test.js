const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const cloudformationCalls = require('../../lib/aws/cloudformation-calls');
const sinon = require('sinon');

describe('cloudformationCalls', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('getStack', function() {
        it('should return the stack if it exists', function() {
            let stackName = "FakeName";
            AWS.mock('CloudFormation', 'describeStacks', Promise.resolve({
                Stacks: [{
                    StackName: stackName
                }]
            }));

            return cloudformationCalls.getStack(stackName)
                .then(stack => {
                    expect(stack.StackName).to.equal(stackName);
                    AWS.restore('CloudFormation');
                });
        });

        it('should return null if the stack doesnt exist', function() {
            let stackName = "FakeName";
            AWS.mock('CloudFormation', 'describeStacks', Promise.reject({
                code: 'ValidationError'
            }));

            return cloudformationCalls.getStack(stackName)
                .then(stack => {
                    expect(stack).to.be.null;
                    AWS.restore('CloudFormation');
                });
        });

        it('should throw an error if one occurs', function() {
            let stackName = "FakeName";
            let errorCode = 'InternalError';
            AWS.mock('CloudFormation', 'describeStacks', Promise.reject({
                code: errorCode
            }));

            return cloudformationCalls.getStack(stackName)
                .then(stack => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(error => {
                    expect(error.code).to.equal(errorCode);
                    AWS.restore('CloudFormation');
                });
        });
    });

    describe('waitForStack', function() {
        it('should wait for the stack', function() {
            let stackName = "FakeStack";
            AWS.mock('CloudFormation', 'waitFor', Promise.resolve({
                Stacks: [{
                    StackName: stackName
                }]
            }));

            return cloudformationCalls.waitForStack(stackName, "stackUpdateComplete")
                .then(stack => {
                    expect(stack.StackName).to.equal(stackName);
                    AWS.restore('CloudFormation');
                })
        });
    });

    describe('createStack', function() {
        it('should create the stack, wait for it to finish, and return the created stack', function() {
            let stackName = "FakeStack";
            AWS.mock('CloudFormation', 'createStack', Promise.resolve({}));
            sandbox.stub(cloudformationCalls, 'waitForStack').returns(Promise.resolve({
                StackName: stackName
            }));

            return cloudformationCalls.createStack(stackName, "FakeTemplateBody", [])
                .then(stack => {
                    expect(stack.StackName).to.equal(stackName);
                    AWS.restore('CloudFormation');
                });
        });
    });

    describe('updateStack', function() {
        it('should update the stack, wait for it to finish, and return the stack', function() {
            let stackName = "FakeStack";
            AWS.mock('CloudFormation', 'updateStack', Promise.resolve({}));
            sandbox.stub(cloudformationCalls, 'waitForStack').returns(Promise.resolve({
                StackName: stackName
            }));

            return cloudformationCalls.updateStack(stackName, "FakeTEmplateBody", [])
                .then(stack => {
                    expect(stack.StackName).to.equal(stackName);
                    AWS.restore('CloudFormation');
                });
        });

        it('should just return the stack if no updates are to be performed', function() {
            let stackName = "FakeStack";
            AWS.mock('CloudFormation', 'updateStack', Promise.reject({
                message: "No updates are to be performed"
            }));
            sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({
                StackName: stackName
            }));

            return cloudformationCalls.updateStack(stackName, "FakeTemplateBody", [])
                .then(stack => {
                    expect(stack.StackName).to.equal(stackName);
                    AWS.restore('CloudFormation');
                });
        });

        it('should throw an error if any other error is returned', function() {
            let message = "Some other error";
            AWS.mock('CloudFormation', 'updateStack', Promise.reject({
                message: message
            }));
            return cloudformationCalls.updateStack("FakeStack", "FakeTemplateBody", [])
                .then(stack => {
                    expect(true).to.be.false;
                })
                .catch(err => {
                    expect(err.message).to.equal(message);
                    AWS.restore('CloudFormation');
                });
        });
    });

    describe('getCfStyleStackParameters', function() {
        it('should take an object of key/value pairs and return them in CloudFormations param format', function() {
            let object = {
                SomeParam: "SomeValue"
            }
            
            let cloudFormationParams = cloudformationCalls.getCfStyleStackParameters(object);
            expect(cloudFormationParams.length).to.equal(1);
            expect(cloudFormationParams[0].ParameterKey).to.equal("SomeParam");
            expect(cloudFormationParams[0].ParameterValue).to.equal("SomeValue");
        });
    });
});