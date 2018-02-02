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
import { AutoScalingConfig, ContainerConfig, HandlebarsEcsTemplateAutoScaling, HandlebarsEcsTemplateContainer, HandlebarsEcsTemplateLoadBalancer, LoadBalancerConfig, HandlebarsEcsTemplateVolume } from '../../common/ecs-shared-config-types';
import { ServiceConfig, Tags } from '../../datatypes/index';

export interface FargateServiceConfig extends ServiceConfig {
    max_mb?: number;
    cpu_units?: number;
    containers: ContainerConfig[];
    auto_scaling: AutoScalingConfig;
    load_balancer?: LoadBalancerConfig;
    log_retention_in_days?: number;
    tags?: Tags;
}

export interface HandlebarsFargateTemplateConfig {
    serviceName: string;
    maxMb: number;
    cpuUnits: number;
    ecsSecurityGroupId: string;
    privateSubnetIds: string[];
    publicSubnetIds: string[];
    asgCooldown: string;
    minimumHealthyPercentDeployment: string;
    vpcId: string;
    policyStatements: any[];
    deploymentSuffix: number;
    tags: Tags;
    containerConfigs: HandlebarsEcsTemplateContainer[];
    autoScaling: HandlebarsEcsTemplateAutoScaling;
    oneOrMoreTasksHasRouting: boolean;
    logGroupName: string;
    assignPublicIp: string;
    logRetentionInDays: number | null;
    loadBalancer?: HandlebarsEcsTemplateLoadBalancer;
    volumes?: HandlebarsEcsTemplateVolume[];
}
