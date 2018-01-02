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
import * as sinon from 'sinon';
import awsWrapper from '../../src/aws/aws-wrapper';
import * as cloudWatchEventsCalls from '../../src/aws/cloudwatch-events-calls';

describe('cloudWatchEventsCalls', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('addTarget', () => {
        it('should add the requested target to the given rule', async () => {
            const putTargetsStub = sandbox.stub(awsWrapper.cloudWatchEvents, 'putTargets').resolves({});

            const targetId = 'FakeTargetId';
            const retTargetId = await cloudWatchEventsCalls.addTarget('FakeRule', 'FakeTargetArn', targetId, '{some: param}');
            expect(putTargetsStub.callCount).to.equal(1);
            expect(retTargetId).to.equal(targetId);
        });
    });

    describe('getTargets', () => {
        it('should return targets if they exist', async () => {
            const listTargetsStub = sandbox.stub(awsWrapper.cloudWatchEvents, 'listTargetsByRule').resolves({
                Targets: []
            });

            const targets = await cloudWatchEventsCalls.getTargets('FakeRule');
            expect(listTargetsStub.callCount).to.equal(1);
            expect(targets).to.deep.equal([]);
        });
    });

    describe('getRule', () => {
        it('should return the rule if it exists', async () => {
            const ruleName = 'MyRule';
            const listRulesStub = sandbox.stub(awsWrapper.cloudWatchEvents, 'listRules').resolves({
                Rules: [{
                    Name: ruleName
                }]
            });

            const rule = await cloudWatchEventsCalls.getRule(ruleName);
            expect(listRulesStub.callCount).to.equal(1);
            expect(rule).to.not.equal(null);
            expect(rule!.Name).to.equal(ruleName);

        });

        it('should return null if the rule doesnt exist', async () => {
            const ruleName = 'NonExistentRule';
            const listRulesStub = sandbox.stub(awsWrapper.cloudWatchEvents, 'listRules').resolves({
                Rules: []
            });

            const rule = await cloudWatchEventsCalls.getRule(ruleName);
            expect(listRulesStub.callCount).to.equal(1);
            expect(rule).to.equal(null);
        });
    });

    describe('removeTargets', () => {
        it('should remove the requested targets', async () => {
            const removeTargetsStub = sandbox.stub(awsWrapper.cloudWatchEvents, 'removeTargets').resolves({
                FailedEntryCount: 0
            });

            const targets = [{
                Id: 'FakeId',
                Arn: 'FakeArn'
            }];
            const success = await cloudWatchEventsCalls.removeTargets('FakeRule', targets);
            expect(success).to.equal(true);
        });

        it('should return false when some targets couldnt be removed', async () => {
            const removeTargetsStub = sandbox.stub(awsWrapper.cloudWatchEvents, 'removeTargets').resolves({
                FailedEntryCount: 1
            });

            const targets = [{
                Id: 'FakeId',
                Arn: 'FakeArn'
            }];
            const success = await cloudWatchEventsCalls.removeTargets('FakeRule', targets);
            expect(success).to.equal(false);
        });
    });

    describe('removeAllTargets', () => {
        it('should remove all targets', async () => {
            const listTargetsStub = sandbox.stub(awsWrapper.cloudWatchEvents, 'listTargetsByRule').resolves({
                Targets: [{
                    Id: 'FakeID'
                }]
            });
            const removeTargetsStub = sandbox.stub(awsWrapper.cloudWatchEvents, 'removeTargets').resolves({
                FailedEntryCount: 0
            });

            const success = await cloudWatchEventsCalls.removeAllTargets('FakeRule');
            expect(success).to.equal(true);
            expect(listTargetsStub.callCount).to.equal(1);
            expect(removeTargetsStub.callCount).to.equal(1);
        });
    });
});
