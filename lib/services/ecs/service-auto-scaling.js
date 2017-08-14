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