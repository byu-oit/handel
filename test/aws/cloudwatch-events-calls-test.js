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
const accountConfig = require('../../lib/common/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const cloudWatchEventsCalls = require('../../lib/aws/cloudwatch-events-calls');
const sinon = require('sinon');

describe('cloudWatchEventsCalls', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
        AWS.restore('CloudWatchEvents');
    });

    describe('addTarget', function() {
        it('should add the requested target to the given rule', function() {
            AWS.mock('CloudWatchEvents', 'putTargets', Promise.resolve({}));
            
            let targetId = "FakeTargetId";
            return cloudWatchEventsCalls.addTarget("FakeRule", "FakeTargetArn", targetId, '{some: param}')
                .then(retTargetId => {
                    expect(retTargetId).to.equal(targetId);
                });
        });
    });

    describe('getTargets', function() {
        it('should return targets if they exist', function() {
            AWS.mock('CloudWatchEvents', 'listTargetsByRule', Promise.resolve({
                Targets: []
            }));

            return cloudWatchEventsCalls.getTargets("FakeRule")
                .then(targets => {
                    expect(targets).to.deep.equal([]);
                });
        });
    });

    describe('getRule', function() {
        it('should return the rule if it exists', function() {
            let ruleName = "MyRule";
            AWS.mock('CloudWatchEvents', 'listRules', Promise.resolve({
                Rules: [{
                    Name: ruleName
                }]
            }));

            return cloudWatchEventsCalls.getRule(ruleName)
                .then(rule => {
                    expect(rule).to.not.be.null;
                    expect(rule.Name).to.equal(ruleName);
                });
        });

        it('should return null if the rule doesnt exist', function() {
            let ruleName = "NonExistentRule";
            AWS.mock('CloudWatchEvents', 'listRules', Promise.resolve({
                Rules: []
            }));

            return cloudWatchEventsCalls.getRule(ruleName)
                .then(rule => {
                    expect(rule).to.be.null;
                });
        });
    })

    describe('removeTargets', function() {
        it('should remove the requested targets', function() {
            AWS.mock('CloudWatchEvents', 'removeTargets', Promise.resolve({
                FailedEntryCount: 0
            }));

            let targets = [{
                Id: "FakeId"
            }];
            return cloudWatchEventsCalls.removeTargets("FakeRule", targets)
                .then(success => {
                    expect(success).to.be.true;
                });
        });

        it('should return false when some targets couldnt be removed', function() {
            AWS.mock('CloudWatchEvents', 'removeTargets', Promise.resolve({
                FailedEntryCount: 1
            }));

            let targets = [{
                Id: "FakeId"
            }];
            return cloudWatchEventsCalls.removeTargets("FakeRule", targets)
                .then(success => {
                    expect(success).to.be.false;
                });
        });
    });

    describe('removeAllTargets', function() {
        it('should remove all targets', function() {
            let getTargetsStub = sandbox.stub(cloudWatchEventsCalls, 'getTargets').returns(Promise.resolve([{
                Id: "FakeID"
            }]));
            let removeTargetsStub = sandbox.stub(cloudWatchEventsCalls, 'removeTargets').returns(Promise.resolve(true));

            return cloudWatchEventsCalls.removeAllTargets("FakeRule")
                .then(success => {
                    expect(success).to.be.true;
                    expect(getTargetsStub.calledOnce).to.be.true;
                    expect(removeTargetsStub.calledOnce).to.be.true;
                });
        });
    })
});