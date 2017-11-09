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
const iotDeployersCommon = require('../../dist/common/iot-deployers-common');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../dist/account-config/account-config');

describe('iot deployers common module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    let producerServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService-Name", "iot", {});

    describe('getTopicRuleNamePrefix', function () {
        it('should return the prefix for the topic rule name (minus the consumer service name)', function () {
            let ruleNamePrefix = iotDeployersCommon.getTopicRuleNamePrefix(producerServiceContext);
            expect(ruleNamePrefix).to.equal("FakeApp_FakeEnv_FakeService_Name");
        });
    });

    describe('getTopicRuleName', function () {
        it('should return the topic rule name from the service information', function () {
            let ruleName = iotDeployersCommon.getTopicRuleName(producerServiceContext, {
                service_name: "FakeConsumer"
            });
            expect(ruleName).to.equal("FakeApp_FakeEnv_FakeService_Name_FakeConsumer");
        });
    });

    describe('getTopicRuleArnPrefix', function () {
        it('should return the prefix of the arn of the topic rule for the given producer/consumer combo', function () {
            return config(`${__dirname}/../test-account-config.yml`)
                .then(accountConfig => {
                    let arnPrefix = iotDeployersCommon.getTopicRuleArnPrefix('FakeApp_FakeEnv_FakeService', accountConfig);
                    expect(arnPrefix).to.equal('arn:aws:iot:us-west-2:123456789012:rule/FakeApp_FakeEnv_FakeService');
                });
        });
    });

    describe('getTopicRuleArn', function () {
        it("should return the arn of the topic rule for the given producer/consumer combo", function () {
            let arn = iotDeployersCommon.getTopicRuleArn('arn:aws:iot:us-west-2:123456789012:rule/FakeApp_FakeEnv_FakeService', "Consumer-Service");
            expect(arn).to.equal('arn:aws:iot:us-west-2:123456789012:rule/FakeApp_FakeEnv_FakeService_Consumer_Service');
        });
    });
});