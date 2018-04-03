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
import * as ecsServiceAutoScaling from '../../src/common/ecs-service-auto-scaling';
import { AutoScalingPolicyType } from '../../src/common/ecs-shared-config-types';
import { AccountConfig, ServiceContext, ServiceType } from '../../src/datatypes';
import { FargateServiceConfig } from '../../src/services/ecs-fargate/config-types';
import { STDLIB_PREFIX } from '../../src/services/stdlib';

describe('ecs service auto scaling common module', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;
    let serviceContext: ServiceContext<FargateServiceConfig>;
    let serviceParams: FargateServiceConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
        serviceParams = {
            type: 'ecsfargate',
            containers: [
                {
                    name: 'mycontainername',
                }
            ],
            auto_scaling: {
                min_tasks: 1,
                max_tasks: 1,
                scaling_policies: [{
                    type: AutoScalingPolicyType.Down,
                    alarm: {
                        comparison_operator: 'FakeComparisonOperator',
                        dimensions: {
                            FakeDimensionName: 'FakeDimensionValue'
                        },
                        metric_name: 'FakeMetricName',
                        threshold: 50,
                    },
                    adjustment: {
                        value: 50
                    }
                }]
            }
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'ecsfargate'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getTemplateAutoScalingConfig', () => {
        it('should return the auto scaling config from the Handel file', () => {
            const autoScalingConfig = ecsServiceAutoScaling.getTemplateAutoScalingConfig(serviceContext, 'FakeClsuterName');
            expect(autoScalingConfig.scalingEnabled).to.equal(true);
            expect(autoScalingConfig.scalingPolicies!.length).to.equal(1);
            expect(autoScalingConfig.scalingPolicies![0].adjustmentValue).to.equal(-50);
        });

        it('should return no scaling policies when none are present in the Handel file', () => {
            delete serviceParams.auto_scaling.scaling_policies;
            const autoScalingConfig = ecsServiceAutoScaling.getTemplateAutoScalingConfig(serviceContext, 'FakeClsuterName');
            expect(autoScalingConfig.scalingEnabled).to.equal(undefined);
        });
    });

    describe('checkAutoScalingSection', () => {
        it('should require the auto_scaling section', () => {
            delete serviceParams.auto_scaling;
            const errors: string[] = [];
            ecsServiceAutoScaling.checkAutoScalingSection(serviceContext, 'Fargate', errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`The 'auto_scaling' section is required`);
        });

        it('should require min_tasks in the auto scaling section', () => {
            delete serviceParams.auto_scaling.min_tasks;
            const errors: string[] = [];
            ecsServiceAutoScaling.checkAutoScalingSection(serviceContext, 'Fargate', errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`The 'min_tasks' parameter is required`);
        });

        it('should require max_tasks in the auto scaling section', () => {
            delete serviceParams.auto_scaling.max_tasks;
            const errors: string[] = [];
            ecsServiceAutoScaling.checkAutoScalingSection(serviceContext, 'Fargate', errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`The 'max_tasks' parameter is required`);
        });

        it('should return no errors for a proper configuration', () => {
            const errors: string[] = [];
            ecsServiceAutoScaling.checkAutoScalingSection(serviceContext, 'Fargate', errors);
            expect(errors.length).to.equal(0);
        });
    });
});
