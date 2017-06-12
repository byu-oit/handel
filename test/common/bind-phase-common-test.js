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
const PreDeployContext = require('../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../lib/datatypes/bind-context');
const bindPhaseCommon = require('../../lib/common/bind-phase-common');
const ec2Calls = require('../../lib/aws/ec2-calls');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('bind phases common module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('bindDependentSecurityGroupToSelf', function() {
        it('should add an ssh ingress on the security group', function() {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let ownServiceContext = new ServiceContext(appName, envName, "FakeService", "mysql", deployVersion, {});
            let ownPreDeployContext = new PreDeployContext(ownServiceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: 'FakeId'
            });

            let dependentOfServiceContext = new ServiceContext(appName, envName, "FakeDependentOfService", "ecs", deployVersion, {});
            let dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);
            dependentOfPreDeployContext.securityGroups.push({
                GroupId: 'OtherId'
            });

            let addIngressRuleToSgIfNotExistsStub = sandbox.stub(ec2Calls, 'addIngressRuleToSgIfNotExists').returns(Promise.resolve({}));

            return bindPhaseCommon.bindDependentSecurityGroupToSelf(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, 'tcp', 22, "FakeService")
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                    expect(addIngressRuleToSgIfNotExistsStub.callCount).to.equal(1);
                });
        })
    })

    describe('bindNotRequired', function () {
        it('should return an empty bind context', function () {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let ownServiceContext = new ServiceContext(appName, envName, "FakeService", "efs", "1", {});
            let dependentOfServiceContext = new ServiceContext(appName, envName, "FakeDependentService", "ecs", "1", {});
            
            return bindPhaseCommon.bindNotRequired(ownServiceContext, dependentOfServiceContext, "FakeService")
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

});