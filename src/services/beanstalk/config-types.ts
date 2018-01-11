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
import { EnvironmentVariables, ServiceConfig, Tags } from '../../datatypes/index';

export interface EbextensionsToInject {
    [ebextensionFileName: string]: string;
}

export interface BeanstalkServiceConfig extends ServiceConfig {
    path_to_code: string;
    solution_stack: string;
    description?: string;
    key_name?: string;
    min_instances?: number; // TODO - This is deprecated and slated to be removed
    max_instances?: number; // TODO - This is deprecated and slated to be removed
    auto_scaling?: BeanstalkAutoScalingConfig;
    instance_type?: string;
    health_check_url?: string;
    routing?: BeanstalkRoutingConfig;
    environment_variables?: EnvironmentVariables;
    tags?: Tags;
}

export interface BeanstalkAutoScalingConfig {
    min_instances: number;
    max_instances: number;
    scaling_policies?: BeanstalkScalingPolicyConfig[];
}

export interface BeanstalkScalingPolicyConfig {
    type: BeanstalkScalingPolicyType;
    adjustment: BeanstalkScalingPolicyAdjustment;
    alarm: BeanstalkScalingPolicyAlarm;
}

export interface BeanstalkScalingPolicyAdjustment {
    type?: string;
    value: number;
    cooldown?: number;
}

export interface BeanstalkScalingPolicyAlarm {
    namespace?: string;
    dimensions?: BeanstalkScalingPolicyAlarmDimensions;
    metric_name: string;
    statistic?: string;
    threshold: number;
    comparison_operator: string;
    period?: number;
    evaluation_periods?: number;
}

export interface BeanstalkScalingPolicyAlarmDimensions {
    [key: string]: string;
}

export enum BeanstalkScalingPolicyType {
    UP = 'up',
    DOWN = 'down'
}

export interface BeanstalkRoutingConfig {
    type: BeanstalkRoutingType;
    https_certificate?: string;
    dns_names?: string[];
}

export enum BeanstalkRoutingType {
    HTTP = 'http',
    HTTPS = 'https'
}

export interface HandlebarsBeanstalkTemplate {
    applicationName: string;
    applicationVersionBucket: string;
    applicationVersionKey: string;
    description: string;
    solutionStack: string;
    optionSettings: HandlebarsBeanstalkOptionSetting[];
    policyStatements: any[];
    tags: Tags;
}

export interface HandlebarsBeanstalkOptionSetting {
    namespace: string;
    optionName: string;
    value: string | number | boolean;
}

export interface HandlebarsBeanstalkAutoScalingTemplate {
    stackName: string;
    scalingPolicies: HandlebarsBeanstalkScalingPolicy[];
}

export interface HandlebarsBeanstalkScalingPolicy {
    adjustmentType: string;
    adjustmentValue: number;
    cooldown: number;
    statistic: string;
    comparisonOperator: string;
    dimensions: HandlebarsBeanstalkAutoScalingDimension[] | undefined;
    metricName: string;
    namespace: string;
    period: number;
    evaluationPeriods: number;
    threshold: number;
    scaleUp?: boolean;
    scaleDown?: boolean;
}

export interface HandlebarsBeanstalkAutoScalingDimension {
    name: string;
    value: string;
}
