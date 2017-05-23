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
const accountConfig = require('../../../lib/util/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const apiaccess = require('../../../lib/services/apiaccess');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const UnBindContext = require('../../../lib/datatypes/un-bind-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('apiaccess deployer', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require the aws_services parameter', function () {
            let serviceContext = {
                params: {}
            }
            let errors = apiaccess.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'aws_services' parameter is required");
        });

        it('should require the provided aws_services to be from the supported list', function () {

        });

        it('should work when there are no configuration errors', function () {

        });
    });

    describe('preDeploy', function () {
        it('should return an empty predeploy context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "apiaccess", "1", {});
            return apiaccess.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                });
        });
    });

    describe('bind', function () {
        it('should return an empty bind context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "apiaccess", "1", {});
            return apiaccess.bind(serviceContext)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('deploy', function () {
        it('should return a deploy context with the given policies', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "apiaccess", "1", {
                aws_services: [
                    "organizations"
                ]
            });
            let preDeployContext = new PreDeployContext(serviceContext);

            return apiaccess.deploy(serviceContext, preDeployContext, [])
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.policies.length).to.equal(1);
                });
        });
    });

    describe('consumeEvents', function () {
        it('should return an error since it cant consume events', function () {
            return apiaccess.consumeEvents(null, null, null, null)
                .then(() => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("API Access service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function () {
        it('should return an error since it doesnt yet produce events', function () {
            return apiaccess.produceEvents(null, null, null, null)
                .then(() => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("API Access service doesn't currently produce");
                });
        });
    });

    describe('unPreDeploy', function () {
        it('should return an empty UnPreDeploy context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "apiaccess", "1", {});
            return apiaccess.unPreDeploy(serviceContext)
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                });
        });
    });

    describe('unBind', function () {
        it('should return an empty UnBind context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "apiaccess", "1", {});
            return apiaccess.unBind(serviceContext)
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                });
        });
    });

    describe('unDeploy', function () {
        it('should return an empty UnDeployContext', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "apiaccess", "1", {});
            return apiaccess.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                });
        });
    });
});