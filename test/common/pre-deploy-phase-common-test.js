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
const preDeployPhaseCommon = require('../../lib/common/pre-deploy-phase-common');
const cloudformationCalls = require('../../lib/aws/cloudformation-calls');
const ec2Calls = require('../../lib/aws/ec2-calls');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('PreDeploy Phase Common module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('createSecurityGroupForService', function () {
        it('should create the security group when it doesnt exist', function () {
            let sgName = "FakeSg";

            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudformationCalls, 'createStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: "GroupId",
                    OutputValue: "SomeId"
                }]
            }))
            let getSecurityGroupByIdStub = sandbox.stub(ec2Calls, 'getSecurityGroupById').returns(Promise.resolve({}));

            return preDeployPhaseCommon.createSecurityGroupForService(sgName, 22)
                .then(securityGroup => {
                    expect(securityGroup).to.deep.equal({});
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(createStackStub.calledOnce).to.be.true;
                    expect(getSecurityGroupByIdStub.calledOnce).to.be.true;
                });
        });

        it('should update the security group when it exists', function () {
            let sgName = "FakeSg";

            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let updateStackStub = sandbox.stub(cloudformationCalls, 'updateStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: "GroupId",
                    OutputValue: "SomeId"
                }]
            }))
            let getSecurityGroupByIdStub = sandbox.stub(ec2Calls, 'getSecurityGroupById').returns(Promise.resolve({}));

            return preDeployPhaseCommon.createSecurityGroupForService(sgName, 22)
                .then(securityGroup => {
                    expect(securityGroup).to.deep.equal({});
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(updateStackStub.calledOnce).to.be.true;
                    expect(getSecurityGroupByIdStub.calledOnce).to.be.true;
                });
        });
    });
});