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
import { EnvironmentVariables, ServiceConfig, Tags } from 'handel-extension-api';
import { HandlebarsInstanceScalingPolicy, InstanceAutoScalingConfig } from '../../datatypes';

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
    auto_scaling?: InstanceAutoScalingConfig;
    instance_type?: string;
    health_check_url?: string;
    routing?: BeanstalkRoutingConfig;
    patching?: BeanstalkPatchingConfig;
    environment_variables?: EnvironmentVariables;
    tags?: Tags;
}

export interface BeanstalkPatchingConfig {
    level: string;
    start_time: string;
    instance_replacement?: boolean;
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
    serviceRoleName: string;
    tags: Tags;
    permissionsBoundary?: string;
}

export interface HandlebarsBeanstalkOptionSetting {
    namespace: string;
    optionName: string;
    value: string | number | boolean;
}

export interface HandlebarsBeanstalkAutoScalingTemplate {
    stackName: string;
    scalingPolicies: HandlebarsInstanceScalingPolicy[];
}
