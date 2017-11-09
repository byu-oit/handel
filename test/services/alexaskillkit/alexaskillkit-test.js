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
const alexaSkillKit = require('../../../dist/services/alexaskillkit');
const ProduceEventsContext = require('../../../dist/datatypes/produce-events-context').ProduceEventsContext;
const DeployContext = require('../../../dist/datatypes/deploy-context').DeployContext;
const ServiceContext = require('../../../dist/datatypes/service-context').ServiceContext;
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../../dist/account-config/account-config');

describe('alexaskillkit deployer', function () {
    let sandbox;
    let serviceContext;

    beforeEach(function () {
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext("Fakepp", "FakeEnv", "FakeService", "alexaskillkit", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should return no errors', function() {
            let errors = alexaSkillKit.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('deploy', function () {
        it('should return an empty deploy context', function () {
            return alexaSkillKit.deploy({}, {}, {})
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                });
        });
    });

    describe('produceEvents', function () {
        it('should return an empty produceEvents context', function () {
            return alexaSkillKit.produceEvents({}, {}, {})
                .then(produceEventsContext => {
                    expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
                });
        });
    });
});