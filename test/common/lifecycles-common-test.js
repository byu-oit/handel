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
const sinon = require('sinon');
const expect = require('chai').expect;
const ServiceContext = require('../../lib/datatypes/service-context');
const PreDeployContext = require('../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../lib/datatypes/bind-context');
const DeployContext = require('../../lib/datatypes/deploy-context');
const UnDeployContext = require('../../lib/datatypes/un-deploy-context');
const UnPreDeployContext = require('../../lib/datatypes/un-pre-deploy-context');
const UnBindContext = require('../../lib/datatypes/un-bind-context');
const lifecyclesCommon = require('../../lib/common/lifecycles-common');

describe('lifecycles common module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('preDeployNotRequired', function() {
        it('should return an empty predeploy context', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return lifecyclesCommon.preDeployNotRequired(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                });
        });
    });

    describe('bindNotRequired', function () {
        it('should return an empty bind context', function () {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let ownServiceContext = new ServiceContext(appName, envName, "FakeService", "efs", "1", {});
            let dependentOfServiceContext = new ServiceContext(appName, envName, "FakeDependentService", "ecs", "1", {});
            
            return lifecyclesCommon.bindNotRequired(ownServiceContext, dependentOfServiceContext, "FakeService")
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });
    
    describe('deployNotRequired', function() {
        it('should return an empty deploy context', function() {
            let ownServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "efs", "1", {});

            return lifecyclesCommon.deployNotRequired(ownServiceContext)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                });
        });
    });

    describe('unPreDeployNotRequired', function() {
        it('should return an empty UnPreDeployContext', function() {
            return lifecyclesCommon.unPreDeployNotRequired({}, "FakeService")
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceOf(UnPreDeployContext);
                });
        });
    });

    describe('unBindNotRequired', function() {
        it('should return an emtpy UnBindContext', function() {
            return lifecyclesCommon.unBindNotRequired({}, "FakeService")
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                });
        });
    });

    describe('unDeployNotRequired', function() {
        it('should return an emtpy UnDeployContext', function() {
            return lifecyclesCommon.unDeployNotRequired({}, "FakeService")
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                });
        });
    });
});