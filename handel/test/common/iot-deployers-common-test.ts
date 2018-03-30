/*
 * Copyright 2018 Brigham Young University
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
import { expect } from 'chai';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import * as iotDeployersCommon from '../../src/common/iot-deployers-common';
import { AccountConfig, ServiceConfig, ServiceContext } from '../../src/datatypes';
import FakeServiceRegistry from '../service-registry/fake-service-registry';

describe('iot deployers common module', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;
    let producerServiceContext: ServiceContext<ServiceConfig>;

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
        producerServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService-Name', 'iot', {type: 'iot'}, accountConfig, new FakeServiceRegistry());
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getTopicRuleNamePrefix', () => {
        it('should return the prefix for the topic rule name (minus the consumer service name)', () => {
            const ruleNamePrefix = iotDeployersCommon.getTopicRuleNamePrefix(producerServiceContext);
            expect(ruleNamePrefix).to.equal('FakeApp_FakeEnv_FakeService_Name');
        });
    });

    describe('getTopicRuleName', () => {
        it('should return the topic rule name from the service information', () => {
            const ruleName = iotDeployersCommon.getTopicRuleName(producerServiceContext, {
                service_name: 'FakeConsumer'
            });
            expect(ruleName).to.equal('FakeApp_FakeEnv_FakeService_Name_FakeConsumer');
        });
    });

    describe('getTopicRuleArnPrefix', () => {
        it('should return the prefix of the arn of the topic rule for the given producer/consumer combo', () => {
            const arnPrefix = iotDeployersCommon.getTopicRuleArnPrefix('FakeApp_FakeEnv_FakeService', accountConfig);
            expect(arnPrefix).to.equal('arn:aws:iot:us-west-2:123456789012:rule/FakeApp_FakeEnv_FakeService');
        });
    });

    describe('getTopicRuleArn', () => {
        it('should return the arn of the topic rule for the given producer/consumer combo', () => {
            const arn = iotDeployersCommon.getTopicRuleArn('arn:aws:iot:us-west-2:123456789012:rule/FakeApp_FakeEnv_FakeService', 'Consumer-Service');
            expect(arn).to.equal('arn:aws:iot:us-west-2:123456789012:rule/FakeApp_FakeEnv_FakeService_Consumer_Service');
        });
    });
});
