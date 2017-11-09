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
const ServiceContext = require('../../dist/datatypes/service-context').ServiceContext;
const PreDeployContext = require('../../dist/datatypes/pre-deploy-context').PreDeployContext;
const BindContext = require('../../dist/datatypes/bind-context').BindContext;
const bindPhaseCommon = require('../../dist/common/bind-phase-common');
const ec2Calls = require('../../dist/aws/ec2-calls');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../dist/account-config/account-config');

describe('bind phases common module', function () {
    let sandbox;
    let serviceContext;
    let appName = "FakeApp";
    let envName = "FakeEnv";

    beforeEach(function () {
        return config(`${__dirname}/../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext(appName, envName, "FakeService", "mysql", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('bindDependentSecurityGroupToSelf', function () {
        it('should add an ssh ingress on the security group', function () {
            let ownPreDeployContext = new PreDeployContext(serviceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: 'FakeId'
            });

            let dependentOfServiceContext = new ServiceContext(appName, envName, "FakeDependentOfService", "ecs", {});
            let dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);
            dependentOfPreDeployContext.securityGroups.push({
                GroupId: 'OtherId'
            });

            let addIngressRuleToSgIfNotExistsStub = sandbox.stub(ec2Calls, 'addIngressRuleToSgIfNotExists').returns(Promise.resolve({}));

            return bindPhaseCommon.bindDependentSecurityGroupToSelf(serviceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, 'tcp', 22, "FakeService")
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                    expect(addIngressRuleToSgIfNotExistsStub.callCount).to.equal(1);
                });
        })
    });
});