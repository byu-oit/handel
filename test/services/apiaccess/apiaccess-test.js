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
const apiaccess = require('../../../lib/services/apiaccess');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../../lib/account-config/account-config');

describe('apiaccess deployer', function () {
    let sandbox;
    let serviceContext;

    beforeEach(function () {
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "apiaccess", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require the aws_services parameter', function () {
            let errors = apiaccess.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'aws_services' parameter is required");
        });

        it('should require the provided aws_services to be from the supported list', function () {
            serviceContext.params = {
                aws_services: [
                    'unknownservice'
                ]
            }
            let errors = apiaccess.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'aws_service' value 'unknownservice' is not supported");
        });

        it('should work when there are no configuration errors', function () {
            serviceContext.params = {
                aws_services: [
                    'ecs'
                ]
            }
            let errors = apiaccess.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('deploy', function () {
        it('should return a deploy context with the given policies', function () {
            serviceContext.params = {
                aws_services: [
                    "organizations",
                    "ec2"
                ]
            }
            let preDeployContext = new PreDeployContext(serviceContext);

            return apiaccess.deploy(serviceContext, preDeployContext, [])
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.policies.length).to.equal(2);
                });
        });
    });
});