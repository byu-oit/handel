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
import { ServiceContext } from 'handel-extension-api';
import { FargateServiceConfig } from '../services/ecs-fargate/config-types';
import { EcsServiceConfig } from '../services/ecs/config-types';
import { AutoScalingAlarmDimensions, HandlebarsEcsTemplateAutoScaling, HandlebarsEcsTemplateScalingDimension, HandlebarsEcsTemplateScalingPolicy } from './ecs-shared-config-types';

function getDimensions(dimensionsConfig: AutoScalingAlarmDimensions | undefined): HandlebarsEcsTemplateScalingDimension[] | null {
    let dimensions = null;

    if (dimensionsConfig) { // User-provided dimensions
        dimensions = [];
        for (const dimensionName in dimensionsConfig) {
            if (dimensionsConfig.hasOwnProperty(dimensionName)) {
                dimensions.push({
                    name: dimensionName,
                    value: dimensionsConfig[dimensionName]
                });
            }
        }
    }

    return dimensions;
}

export function getTemplateAutoScalingConfig(ownServiceContext: ServiceContext<EcsServiceConfig>, clusterName: string): HandlebarsEcsTemplateAutoScaling {
    const serviceParams = ownServiceContext.params;
    const autoScaling: HandlebarsEcsTemplateAutoScaling = {
        minTasks: serviceParams.auto_scaling.min_tasks,
        maxTasks: serviceParams.auto_scaling.max_tasks
    };

    if (serviceParams.auto_scaling.scaling_policies) {
        autoScaling.scalingEnabled = true;
        autoScaling.scalingPolicies = [];
        for (const policyConfig of serviceParams.auto_scaling.scaling_policies) {
            const scalingPolicy: HandlebarsEcsTemplateScalingPolicy = {
                adjustmentType: policyConfig.adjustment.type || 'ChangeInCapacity',
                adjustmentValue: policyConfig.adjustment.value,
                cooldown: policyConfig.cooldown || 300,
                metricAggregationType: policyConfig.alarm.aggregation_type || 'Average',
                comparisonOperator: policyConfig.alarm.comparison_operator,
                dimensions: getDimensions(policyConfig.alarm.dimensions),
                metricName: policyConfig.alarm.metric_name,
                namespace: policyConfig.alarm.namespace || 'AWS/ECS',
                period: policyConfig.alarm.period || 60,
                evaluationPeriods: policyConfig.alarm.evaluation_periods || 5,
                threshold: policyConfig.alarm.threshold
            };

            // Determine whehter scaling up or down.
            if (policyConfig.type === 'up') {
                scalingPolicy.scaleUp = true;
            }
            else {
                scalingPolicy.scaleDown = true;
                scalingPolicy.adjustmentValue = -scalingPolicy.adjustmentValue; // Remove instead of add on scale down
            }

            autoScaling.scalingPolicies.push(scalingPolicy);
        }
    }

    return autoScaling;
}

export function checkAutoScalingSection(serviceContext: ServiceContext<EcsServiceConfig | FargateServiceConfig>, serviceName: string, errors: string[]) {
    const params = serviceContext.params;
    if (!params.auto_scaling) {
        errors.push(`The 'auto_scaling' section is required`);
    }
    else {
        if (!params.auto_scaling.min_tasks) {
            errors.push(`The 'min_tasks' parameter is required in the 'auto_scaling' section`);
        }
        if (!params.auto_scaling.max_tasks) {
            errors.push(`The 'max_tasks' parameter is required in the 'auto_scaling' section`);
        }
    }
}
