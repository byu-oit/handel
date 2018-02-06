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
import 'mocha';
import * as sinon from 'sinon';
import awsWrapper from '../../src/aws/aws-wrapper';
import * as cloudformationCalls from '../../src/aws/cloudformation-calls';

describe('cloudformationCalls', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getStack', () => {
        it('should return the stack if it exists', async () => {
            const stackName = 'FakeName';
            const describeStacksStub = sandbox.stub(awsWrapper.cloudFormation, 'describeStacks').resolves({
                Stacks: [{
                    StackName: stackName
                }]
            });

            const stack = await cloudformationCalls.getStack(stackName);
            expect(stack).to.not.equal(null);
            expect(stack!.StackName).to.equal(stackName);
            expect(describeStacksStub.callCount).to.equal(1);
        });

        it('should return null if the stack doesnt exist', async () => {
            const stackName = 'FakeName';
            const describeStacksStub = sandbox.stub(awsWrapper.cloudFormation, 'describeStacks').rejects({
                code: 'ValidationError'
            });

            const stack = await cloudformationCalls.getStack(stackName);
            expect(describeStacksStub.callCount).to.equal(1);
            expect(stack).to.equal(null);
        });

        it('should throw an error if one occurs', async () => {
            const stackName = 'FakeName';
            const errorCode = 'InternalError';
            const describeStacksStub = sandbox.stub(awsWrapper.cloudFormation, 'describeStacks').rejects({
                code: errorCode
            });

            try {
                const stack = await cloudformationCalls.getStack(stackName);
                expect(true).to.equal(false); // Should not get here
            }
            catch (err) {
                expect(err.code).to.equal(errorCode);
                expect(describeStacksStub.callCount).to.equal(1);
            }
        });
    });

    describe('waitForStack', () => {
        it('should wait for the stack to be in the given state', async () => {
            const stackName = 'FakeStack';
            const waitForStub = sandbox.stub(awsWrapper.cloudFormation, 'waitFor').resolves({
                Stacks: [{
                    StackName: stackName
                }]
            });

            const stack = await cloudformationCalls.waitForStack(stackName, 'stackUpdateComplete');
            expect(waitForStub.callCount).to.equal(1);
            expect(stack.StackName).to.equal(stackName);
        });
    });

    describe('createStack', () => {
        it('should create the stack, wait for it to finish, and return the created stack', async () => {
            const stackName = 'FakeStack';
            const createStackStub = sandbox.stub(awsWrapper.cloudFormation, 'createStack').resolves({});
            const waitForStub = sandbox.stub(awsWrapper.cloudFormation, 'waitFor').resolves({
                Stacks: [{
                    StackName: stackName
                }]
            });

            const stack = await cloudformationCalls.createStack(stackName, 'FakeTemplateBody', [], {});
            expect(stack.StackName).to.equal(stackName);
            expect(createStackStub.callCount).to.equal(1);
            expect(waitForStub.callCount).to.equal(1);
        });
    });

    describe('updateStack', () => {
        it('should update the stack, wait for it to finish, and return the stack', async () => {
            const stackName = 'FakeStack';
            const updateStackStub = sandbox.stub(awsWrapper.cloudFormation, 'updateStack').resolves({});
            const waitForStub = sandbox.stub(awsWrapper.cloudFormation, 'waitFor').resolves({
                Stacks: [{
                    StackName: stackName
                }]
            });

            const stack = await cloudformationCalls.updateStack(stackName, 'FakeTemplateBody', [], {});
            expect(stack.StackName).to.equal(stackName);
            expect(updateStackStub.callCount).to.equal(1);
            expect(waitForStub.callCount).to.equal(1);
        });

        it('should just return the stack if no updates are to be performed', async () => {
            const stackName = 'FakeStack';
            const updateStackStub = sandbox.stub(awsWrapper.cloudFormation, 'updateStack').rejects({
                message: 'No updates are to be performed'
            });
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').resolves({
                StackName: stackName
            });

            const stack = await cloudformationCalls.updateStack(stackName, 'FakeTemplateBody', [], {});
            expect(stack.StackName).to.equal(stackName);
            expect(updateStackStub.callCount).to.equal(1);
            expect(getStackStub.callCount).to.equal(1);
        });

        it('should throw an error if any other error is returned', async () => {
            const message = 'Some other error';
            const updateStackStub = sandbox.stub(awsWrapper.cloudFormation, 'updateStack').rejects({
                message: message
            });

            try {
                const stack = await cloudformationCalls.updateStack('FakeStack', 'FakeTemplateBody', [], {});
                expect(true).to.equal(false); // Should not get here
            }
            catch (err) {
                expect(err.message).to.equal(message);
                expect(updateStackStub.callCount).to.equal(1);
            }
        });
    });

    describe('deleteStack', () => {
        it('should delete the stack', async () => {
            const deleteStackStub = sandbox.stub(awsWrapper.cloudFormation, 'deleteStack').resolves({});
            const waitForStub = sandbox.stub(awsWrapper.cloudFormation, 'waitFor').resolves({});

            const result = await cloudformationCalls.deleteStack('FakeStack');
            expect(result).to.equal(true);
            expect(deleteStackStub.callCount).to.equal(1);
            expect(waitForStub.callCount).to.equal(1);
        });
    });

    describe('getCfStyleStackParameters', () => {
        it('should take an object of key/value pairs and return them in CloudFormations param format', () => {
            const object = {
                SomeParam: 'SomeValue'
            };

            const cloudFormationParams = cloudformationCalls.getCfStyleStackParameters(object);
            expect(cloudFormationParams.length).to.equal(1);
            expect(cloudFormationParams[0].ParameterKey).to.equal('SomeParam');
            expect(cloudFormationParams[0].ParameterValue).to.equal('SomeValue');
        });
    });

    describe('getOutput', () => {
        it('should get the given output from the CF stack if present', () => {
            const key = 'FakeKey';
            const value = 'FakeValue';
            const stack: AWS.CloudFormation.Stack = {
                StackName: 'FakeStack',
                CreationTime: new Date(),
                StackStatus: 'CREATE_COMPLETE',
                Outputs: [{
                    OutputKey: key,
                    OutputValue: value
                }]
            };

            const output = cloudformationCalls.getOutput(key, stack);
            expect(output).to.equal(value);
        });

        it('should return null for the given output if not present', () => {
            const stack = {
                StackName: 'FakeStack',
                CreationTime: new Date(),
                StackStatus: 'CREATE_COMPLETE',
                Outputs: []
            };

            const output = cloudformationCalls.getOutput('FakeKey', stack);
            expect(output).to.equal(null);
        });
    });
});
