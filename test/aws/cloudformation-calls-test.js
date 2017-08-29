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
const cloudformationCalls = require('../../lib/aws/cloudformation-calls');
const sinon = require('sinon');

describe('cloudformationCalls', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
        AWS.restore('CloudFormation');
    });

    describe('getStack', function () {
        it('should return the stack if it exists', function () {
            let stackName = "FakeName";
            AWS.mock('CloudFormation', 'describeStacks', Promise.resolve({
                Stacks: [{
                    StackName: stackName
                }]
            }));

            return cloudformationCalls.getStack(stackName)
                .then(stack => {
                    expect(stack.StackName).to.equal(stackName);
                });
        });

        it('should return null if the stack doesnt exist', function () {
            let stackName = "FakeName";
            AWS.mock('CloudFormation', 'describeStacks', Promise.reject({
                code: 'ValidationError'
            }));

            return cloudformationCalls.getStack(stackName)
                .then(stack => {
                    expect(stack).to.be.null;
                });
        });

        it('should throw an error if one occurs', function () {
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
                });
        });
    });

    describe('waitForStack', function () {
        it('should wait for the stack to be in the given state', function () {
            let stackName = "FakeStack";
            AWS.mock('CloudFormation', 'waitFor', Promise.resolve({
                Stacks: [{
                    StackName: stackName
                }]
            }));

            return cloudformationCalls.waitForStack(stackName, "stackUpdateComplete")
                .then(stack => {
                    expect(stack.StackName).to.equal(stackName);
                })
        });
    });

    describe('createStack', function () {
        it('should create the stack, wait for it to finish, and return the created stack', function () {
            let stackName = "FakeStack";
            AWS.mock('CloudFormation', 'createStack', Promise.resolve({}));
            sandbox.stub(cloudformationCalls, 'waitForStack').returns(Promise.resolve({
                StackName: stackName
            }));

            return cloudformationCalls.createStack(stackName, "FakeTemplateBody", [])
                .then(stack => {
                    expect(stack.StackName).to.equal(stackName);
                });
        });
    });

    describe('updateStack', function () {
        it('should update the stack, wait for it to finish, and return the stack', function () {
            let stackName = "FakeStack";
            AWS.mock('CloudFormation', 'updateStack', Promise.resolve({}));
            sandbox.stub(cloudformationCalls, 'waitForStack').returns(Promise.resolve({
                StackName: stackName
            }));

            return cloudformationCalls.updateStack(stackName, "FakeTEmplateBody", [])
                .then(stack => {
                    expect(stack.StackName).to.equal(stackName);
                });
        });

        it('should just return the stack if no updates are to be performed', function () {
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
                });
        });

        it('should throw an error if any other error is returned', function () {
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
                });
        });
    });

    describe('deleteStack', function () {
        it('should delete the stack', function () {
            AWS.mock('CloudFormation', 'deleteStack', Promise.resolve({}));
            AWS.mock('CloudFormation', 'waitFor', Promise.resolve({}));

            return cloudformationCalls.deleteStack("FakeStack")
                .then(result => {
                    expect(result).to.be.true;
                });
        });
    });

    describe('getCfStyleStackParameters', function () {
        it('should take an object of key/value pairs and return them in CloudFormations param format', function () {
            let object = {
                SomeParam: "SomeValue"
            }

            let cloudFormationParams = cloudformationCalls.getCfStyleStackParameters(object);
            expect(cloudFormationParams.length).to.equal(1);
            expect(cloudFormationParams[0].ParameterKey).to.equal("SomeParam");
            expect(cloudFormationParams[0].ParameterValue).to.equal("SomeValue");
        });
    });

    describe('getOutput', function () {
        it('should get the given output from the CF stack if present', function () {
            let key = "FakeKey";
            let value = "FakeValue";
            let stack = {
                Outputs: [{
                    OutputKey: key,
                    OutputValue: value
                }]
            }

            let output = cloudformationCalls.getOutput(key, stack);
            expect(output).to.equal(value);
        });

        it('should return null for the given output if not present', function () {
            let stack = {
                Outputs: []
            }

            let output = cloudformationCalls.getOutput("FakeKey", stack);
            expect(output).to.be.null;
        });
    });
});