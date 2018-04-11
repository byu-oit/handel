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

export interface CodeDeployServiceConfig extends ServiceConfig {
    path_to_code: string;
    os: string;
    instance_type?: string;
    key_name?: string;
    deployment?: CodeDeployDeploymentConfig;
    auto_scaling?: InstanceAutoScalingConfig;
    routing?: CodeDeployRoutingConfig;
    environment_variables?: EnvironmentVariables;
    tags?: Tags;
}

export interface CodeDeployDeploymentConfig {
    style: string;
    config: string;
}

export interface CodeDeployRoutingConfig {
    type: string;
    https_certificate?: string;
    base_path?: string;
    health_check_path?: string;
    dns_names: string[];
}

export interface HandlebarsCodeDeployTemplate {
    appName: string;
    policyStatements: any[];
    amiImageId: string;
    instanceType: string;
    securityGroupId: string;
    userData: string;
    autoScaling: HandlebarsCodeDeployAutoScalingConfig;
    routing?: HandlebarsCodeDeployRoutingConfig;
    tags: Tags;
    privateSubnetIds: string[];
    publicSubnetIds: string[];
    vpcId: string;
    s3BucketName: string;
    s3KeyName: string;
    deploymentConfigName: string;
    serviceRoleArn: string;
    sshKeyName?: string;
    assignPublicIp: boolean;
}

export interface HandlebarsCodeDeployAutoScalingConfig {
    minInstances: number;
    maxInstances: number;
    cooldown: string;
    scalingPolicies: HandlebarsInstanceScalingPolicy[];
}

export interface HandlebarsCodeDeployRoutingConfig {
    albName: string;
    httpsCertificate?: string;
    basePath: string;
    healthCheckPath: string;
    dnsNames?: HandlebarsCodeDeployDnsNamesConfig[];
}

export interface HandlebarsCodeDeployDnsNamesConfig {
    name: string;
    zoneId: string;
}
