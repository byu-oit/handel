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
