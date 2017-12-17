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
const preDeployPhaseCommon = require('../../dist/common/pre-deploy-phase-common');
const cloudformationCalls = require('../../dist/aws/cloudformation-calls');
const ServiceContext = require('../../dist/datatypes/service-context').ServiceContext;
const PreDeployContext = require('../../dist/datatypes/pre-deploy-context').PreDeployContext;
const ec2Calls = require('../../dist/aws/ec2-calls');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../dist/account-config/account-config').default;

describe('PreDeploy Phase Common module', function () {
    let sandbox;
    let serviceContext;

    beforeEach(function () {
        return config(`${__dirname}/../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('preDeployCreateSecurityGroup', function () {
        it('should create the security group when it doesnt exist', function () {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudformationCalls, 'createStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: "GroupId",
                    OutputValue: "SomeId"
                }]
            }))
            let getSecurityGroupByIdStub = sandbox.stub(ec2Calls, 'getSecurityGroupById').returns(Promise.resolve({}));

            return preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, 22, "FakeService")
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceOf(PreDeployContext);
                    expect(preDeployContext.securityGroups.length).to.equal(1);
                    expect(preDeployContext.securityGroups[0]).to.deep.equal({});
                    expect(getStackStub.callCount).to.equal(1);
                    expect(createStackStub.callCount).to.equal(1);
                    expect(getSecurityGroupByIdStub.callCount).to.equal(1);
                });
        });

        it('should update the security group when it exists', function () {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let updateStackStub = sandbox.stub(cloudformationCalls, 'updateStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: "GroupId",
                    OutputValue: "SomeId"
                }]
            }))
            let getSecurityGroupByIdStub = sandbox.stub(ec2Calls, 'getSecurityGroupById').returns(Promise.resolve({}));

            return preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, 22, "FakeService")
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceOf(PreDeployContext);
                    expect(preDeployContext.securityGroups.length).to.equal(1);
                    expect(preDeployContext.securityGroups[0]).to.deep.equal({});
                    expect(getStackStub.callCount).to.equal(1);
                    expect(updateStackStub.callCount).to.equal(1);
                    expect(getSecurityGroupByIdStub.callCount).to.equal(1);
                });
        });
    });
});