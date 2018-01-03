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
function getDimensions(dimensionsConfig) {
    let dimensions = null;

    if (dimensionsConfig) { //User-provided dimensions
        dimensions = [];
        for (let dimensionName in dimensionsConfig) {
            dimensions.push({
                name: dimensionName,
                value: dimensionsConfig[dimensionName]
            });
        }
    }

    return dimensions;
}

exports.getTemplateAutoScalingConfig = function(ownServiceContext, clusterName) {
    let serviceParams = ownServiceContext.params;
    let autoScaling = {
        minTasks: serviceParams.auto_scaling.min_tasks,
        maxTasks: serviceParams.auto_scaling.max_tasks
    };

    if (serviceParams.auto_scaling.scaling_policies) {
        autoScaling.scalingEnabled = true;
        autoScaling.scalingPolicies = [];
        for (let policyConfig of serviceParams.auto_scaling.scaling_policies) {
            let scalingPolicy = {
                adjustmentType: policyConfig.adjustment.type || "ChangeInCapacity",
                adjustmentValue: policyConfig.adjustment.value,
                cooldown: policyConfig.cooldown || 300,
                metricAggregationType: policyConfig.alarm.aggregation_type || "Average",
                comparisonOperator: policyConfig.alarm.comparison_operator,
                dimensions: getDimensions(policyConfig.alarm.dimensions),
                metricName: policyConfig.alarm.metric_name,
                namespace: policyConfig.alarm.namespace || "AWS/ECS",
                period: policyConfig.alarm.period || 60,
                evaluationPeriods: policyConfig.alarm.evaluation_periods || 5,
                threshold: policyConfig.alarm.threshold
            }

            //Determine whehter scaling up or down.
            if (policyConfig.type === "up") {
                scalingPolicy.scaleUp = true;
            }
            else {
                scalingPolicy.scaleDown = true;
                scalingPolicy.adjustmentValue = -scalingPolicy.adjustmentValue; //Remove instead of add on scale down
            }

            autoScaling.scalingPolicies.push(scalingPolicy)
        }
    }

    return autoScaling;
}

exports.checkAutoScalingSection = function(serviceContext, serviceName, errors) {
    let params = serviceContext.params;
    if (!params.auto_scaling) {
        errors.push(`${serviceName} - The 'auto_scaling' section is required`);
    }
    else {
        if (!params.auto_scaling.min_tasks) {
            errors.push(`${serviceName} - The 'min_tasks' parameter is required in the 'auto_scaling' section`);
        }
        if (!params.auto_scaling.max_tasks) {
            errors.push(`${serviceName} - The 'max_tasks' parameter is required in the 'auto_scaling' section`);
        }
    }
}