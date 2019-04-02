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
import { AccountConfig, ServiceContext, ServiceType } from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import * as instanceAutoScaling from '../../src/common/instance-auto-scaling';
import { InstanceScalingPolicyType } from '../../src/datatypes';
import { CodeDeployServiceConfig } from '../../src/services/codedeploy/config-types';
import { STDLIB_PREFIX } from '../../src/services/stdlib';

describe('instance auto scaling common module', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;
    let serviceContext: ServiceContext<CodeDeployServiceConfig>;
    let serviceParams: CodeDeployServiceConfig;

    beforeEach(async () => {
        sandbox = sinon.createSandbox();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
        serviceParams = {
            type: 'codedeploy',
            path_to_code: '.',
            os: 'linux',
            auto_scaling: {
                min_instances: 1,
                max_instances: 1,
                scaling_policies: [
                    {
                        type: InstanceScalingPolicyType.UP,
                        adjustment: {
                            value: 1
                        },
                        alarm: {
                            metric_name: 'CPUUtilization',
                            comparison_operator: 'GreaterThanThreshold',
                            threshold: 70,
                            period: 60
                        }
                    },
                    {
                        type: InstanceScalingPolicyType.DOWN,
                        adjustment: {
                            value: 3,
                            cooldown: 200
                        },
                        alarm: {
                            metric_name: 'ApproximateNumberOfMessagesVisible',
                            comparison_operator: 'GreaterThanThreshold',
                            namespace: 'AWS/SQS',
                            dimensions: {
                                QueueName: 'myFakeQueue'
                            },
                            threshold: 2000,
                            period: 60
                        }
                    }
                ]
            }
        };
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 'codedeploy'), serviceParams, accountConfig, {});
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getScalingPoliciesConfig', () => {
        it('should return the scaling policies config for the CF templates', () => {
            const scalingPolicies = instanceAutoScaling.getScalingPoliciesConfig(serviceContext);
            expect(scalingPolicies.length).to.equal(2);

            // Note - these scaling policies don't make any real sense, this is just for the purpose of the test
            expect(scalingPolicies[0]).to.deep.equal({
                adjustmentType: 'ChangeInCapacity',
                adjustmentValue: 1,
                cooldown: 300,
                statistic: 'Average',
                comparisonOperator: 'GreaterThanThreshold',
                dimensions: undefined,
                metricName: 'CPUUtilization',
                namespace: 'AWS/EC2',
                period: 60,
                evaluationPeriods: 5,
                threshold: 70,
                scaleUp: true
            });
            expect(scalingPolicies[1]).to.deep.equal({
                adjustmentType: 'ChangeInCapacity',
                adjustmentValue: -3,
                cooldown: 200,
                statistic: 'Average',
                comparisonOperator: 'GreaterThanThreshold',
                dimensions: [{
                    name: 'QueueName',
                    value: 'myFakeQueue'
                }],
                metricName: 'ApproximateNumberOfMessagesVisible',
                namespace: 'AWS/SQS',
                period: 60,
                evaluationPeriods: 5,
                threshold: 2000,
                scaleDown: true
            });
        });
    });
});
