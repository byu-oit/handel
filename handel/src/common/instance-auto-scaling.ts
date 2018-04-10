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
import { HandlebarsInstanceScalingDimension, HandlebarsInstanceScalingPolicy, InstanceScalingPolicyAlarmDimensions, ServiceContext } from '../datatypes';
import { BeanstalkServiceConfig } from '../services/beanstalk/config-types';
import { CodeDeployServiceConfig } from '../services/codedeploy/config-types';

function getAutoScalingDimensions(dimensionsConfig: InstanceScalingPolicyAlarmDimensions): HandlebarsInstanceScalingDimension[] | undefined {
    if (dimensionsConfig) { // User-provided dimensions
        const dimensions: HandlebarsInstanceScalingDimension[] = [];
        for (const dimensionName in dimensionsConfig) {
            if (dimensionsConfig.hasOwnProperty(dimensionName)) {
                dimensions.push({
                    name: dimensionName,
                    value: dimensionsConfig[dimensionName]
                });
            }
        }
        return dimensions;
    }
    else {
        return undefined;
    }
}

export function getScalingPoliciesConfig(serviceContext: ServiceContext<CodeDeployServiceConfig | BeanstalkServiceConfig>): HandlebarsInstanceScalingPolicy[] {
    const serviceParams = serviceContext.params;

    const scalingPolicies: HandlebarsInstanceScalingPolicy[] = [];
    if(serviceParams.auto_scaling && serviceParams.auto_scaling.scaling_policies) {
        for (const policyConfig of serviceParams.auto_scaling.scaling_policies) {
            const scalingPolicy: HandlebarsInstanceScalingPolicy = {
                adjustmentType: policyConfig.adjustment.type || 'ChangeInCapacity',
                adjustmentValue: policyConfig.adjustment.value,
                cooldown: policyConfig.adjustment.cooldown || 300,
                statistic: policyConfig.alarm.statistic || 'Average',
                comparisonOperator: policyConfig.alarm.comparison_operator,
                dimensions: getAutoScalingDimensions(policyConfig.alarm.dimensions!),
                metricName: policyConfig.alarm.metric_name,
                namespace: policyConfig.alarm.namespace || 'AWS/EC2',
                period: policyConfig.alarm.period || 60,
                evaluationPeriods: policyConfig.alarm.evaluation_periods || 5,
                threshold: policyConfig.alarm.threshold
            };

            if (policyConfig.type === 'up') {
                scalingPolicy.scaleUp = true;
            }
            else {
                scalingPolicy.scaleDown = true;
                scalingPolicy.adjustmentValue = -scalingPolicy.adjustmentValue; // Remove instead of add on scale down
            }

            scalingPolicies.push(scalingPolicy);
        }
    }

    return scalingPolicies;
}
