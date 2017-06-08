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
const ServiceContext = require('../../lib/datatypes/service-context');
const UnDeployContext = require('../../lib/datatypes/un-deploy-context');
const deletePhasesCommon = require('../../lib/common/delete-phases-common');
const cloudformationCalls = require('../../lib/aws/cloudformation-calls');
const ec2Calls = require('../../lib/aws/ec2-calls');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('Delete phases common module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('unBindAllOnSg', function () {
        it('should remove all ingress from the given security group', function () {
            let removeIngressStub = sandbox.stub(ec2Calls, 'removeAllIngressFromSg').returns(Promise.resolve({}));

            return deletePhasesCommon.unBindAllOnSg('FakeStack')
                .then(success => {
                    expect(success).to.be.true;
                    expect(removeIngressStub.calledOnce).to.be.true;
                });
        });
    });

    describe('deleteSecurityGroupForService', function () {
        it('should delete the stack if it exists', function () {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').returns(Promise.resolve(true));

            return deletePhasesCommon.deleteSecurityGroupForService("FakeStack")
                .then(success => {
                    expect(success).to.be.true;
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(deleteStackStub.calledOnce).to.be.true;
                });
        });

        it('should return true if the stack is already deleted', function () {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').returns(Promise.resolve(true));

            return deletePhasesCommon.deleteSecurityGroupForService("FakeStack")
                .then(success => {
                    expect(success).to.be.true;
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(deleteStackStub.notCalled).to.be.true;
                });
        })
    });

    describe('unDeployCloudFormationStack', function () {
        it('should delete the stack if it exists', function () {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').returns(Promise.resolve(true));

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "dynamodb", "1", {});
            return deletePhasesCommon.unDeployCloudFormationStack(serviceContext, "DynamoDB")
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(deleteStackStub.calledOnce).to.be.true;
                });
        });

        it('should suceed even if the stack has been deleted', function () {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').returns(Promise.resolve(true));

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "dynamodb", "1", {});
            return deletePhasesCommon.unDeployCloudFormationStack(serviceContext, "DynamoDB")
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(deleteStackStub.notCalled).to.be.true;
                });
        });
    });

});