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
import {
    DeployContext,
    DeployOutputType,
    PreDeployContext,
    ServiceConfig,
    ServiceContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import { deletePhases, deployPhase, handlebars, preDeployPhase, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import * as ec2Calls from '../../aws/ec2-calls';
import * as ecsCalls from '../../aws/ecs-calls';
import * as route53 from '../../aws/route53-calls';
import * as containersSection from '../../common/ecs-containers';
import * as routingSection from '../../common/ecs-routing';
import * as serviceAutoScalingSection from '../../common/ecs-service-auto-scaling';
import * as volumesSection from '../../common/ecs-volumes';
import { FargateServiceConfig, HandlebarsFargateTemplateConfig } from './config-types';

const SERVICE_NAME = 'ECS Fargate';

interface AllowedFargateMemoryForCpu {
    [cpuUnits: number]: number[];
}

const DEFAULT_MAX_MB = 512;
const DEFAULT_CPU_UNITS = 256;
const ALLOWED_FARGATE_MEMORY_FOR_CPU: AllowedFargateMemoryForCpu = {
    256: [512, 1024, 2048],
    512: [1024, 2048, 3072, 4096],
    1024: [2048, 3072, 4096, 5120, 6144, 7168, 8192],
    2048: [4096, 5120, 6144, 7168, 8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384],
    4096: [8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384, 17408, 18432, 19456, 20480, 21504, 22528, 23552, 24576, 25600, 26624, 27648, 28672, 29696, 30720]
};

function getTaskRoleStatements(serviceContext: ServiceContext<FargateServiceConfig>, dependenciesDeployContexts: DeployContext[]) {
    return deployPhase.getAllPolicyStatementsForServiceRole(serviceContext, [], dependenciesDeployContexts, true);
}

async function getCompiledEcsFargateTemplate(serviceName: string, ownServiceContext: ServiceContext<FargateServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<string> {
    const accountConfig = ownServiceContext.accountConfig;
    const serviceParams = ownServiceContext.params;

    // Configure auto-scaling
    const autoScaling = serviceAutoScalingSection.getTemplateAutoScalingConfig(ownServiceContext, serviceName);

    // Configure containers in the task definition
    const containerConfigs = containersSection.getContainersConfig(ownServiceContext, dependenciesDeployContexts, serviceName);
    const oneOrMoreTasksHasRouting = routingSection.oneOrMoreTasksHasRouting(ownServiceContext);

    const logRetention = ownServiceContext.params.log_retention_in_days;

    // Figure out whether the private subnets should auto-assign public IPs
    const shouldAssignPublicIp = await ec2Calls.shouldAssignPublicIp(accountConfig.private_subnets);

    // Create object used for templating the CloudFormation template
    const handlebarsParams: HandlebarsFargateTemplateConfig = {
        serviceName,
        maxMb: serviceParams.max_mb || DEFAULT_MAX_MB,
        cpuUnits: serviceParams.cpu_units || DEFAULT_CPU_UNITS,
        ecsSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId!,
        privateSubnetIds: accountConfig.private_subnets,
        publicSubnetIds: accountConfig.public_subnets,
        asgCooldown: '60', // This is set pretty short because we handle the instance-level auto-scaling from a Lambda that runs every minute.
        minimumHealthyPercentDeployment: '50', // TODO - Do we need to support more than just 50?
        vpcId: accountConfig.vpc,
        policyStatements: getTaskRoleStatements(ownServiceContext, dependenciesDeployContexts),
        deploymentSuffix: Math.floor(Math.random() * 10000), // ECS won't update unless something in the service changes.
        tags: tagging.getTags(ownServiceContext),
        containerConfigs,
        autoScaling,
        oneOrMoreTasksHasRouting,
        // This make it default to 'enabled'
        logGroupName: `${ownServiceContext.appName}-${ownServiceContext.environmentName}-${ownServiceContext.serviceName}`,
        // Default to not set, which means infinite.
        logRetentionInDays: logRetention !== 0 ? logRetention! : null,
        assignPublicIp: shouldAssignPublicIp ? 'ENABLED' : 'DISABLED'
    };

    // Configure routing if present in any of the containers
    if (oneOrMoreTasksHasRouting) {
        const hostedZones = await route53.listHostedZones();
        handlebarsParams.loadBalancer = routingSection.getLoadBalancerConfig(serviceParams, containerConfigs, serviceName, hostedZones, accountConfig);
    }

    // Add volumes if present (these are consumed by one or more container mount points)
    handlebarsParams.volumes = volumesSection.getVolumes(dependenciesDeployContexts);

    return handlebars.compileTemplate(`${__dirname}/ecs-fargate-template.yml`, handlebarsParams);
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */
export function check(serviceContext: ServiceContext<FargateServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    // TODO check that all values are valid, like Cpu and Memory, logRetentionInDays possible values at http://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutRetentionPolicy.html
    const errors = [];
    const params = serviceContext.params;
    const retention = params.log_retention_in_days;

    if (retention && typeof retention !== 'number') {
        errors.push(`${SERVICE_NAME} - The 'log_retention_in_days' parameter must be a number`);
    }

    const requestedCpuUnits = params.cpu_units || DEFAULT_CPU_UNITS;
    const requestedMemory = params.max_mb || DEFAULT_MAX_MB;
    if (!ALLOWED_FARGATE_MEMORY_FOR_CPU[requestedCpuUnits] || !ALLOWED_FARGATE_MEMORY_FOR_CPU[requestedCpuUnits].includes(requestedMemory)) {
        errors.push(`${SERVICE_NAME} - Invalid memory/cpu combination. You requested '${requestedCpuUnits}' CPU Units and '${requestedMemory}MB' memory.`);
    }

    serviceAutoScalingSection.checkAutoScalingSection(serviceContext, SERVICE_NAME, errors);
    routingSection.checkLoadBalancerSection(serviceContext, SERVICE_NAME, errors);
    containersSection.checkContainers(serviceContext, SERVICE_NAME, errors);

    return errors;
}

export async function preDeploy(serviceContext: ServiceContext<FargateServiceConfig>) {
    return preDeployPhase.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
}

export async function deploy(ownServiceContext: ServiceContext<FargateServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]) {
    const stackName = ownServiceContext.stackName();
    winston.info(`${SERVICE_NAME} - Deploying ECS Fargate Service '${stackName}'`);

    await ecsCalls.createDefaultClusterIfNotExists();
    const compiledFargateTemplate = await getCompiledEcsFargateTemplate(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts);
    const stackTags = tagging.getTags(ownServiceContext);
    const deployedStack = await deployPhase.deployCloudFormationStack(stackName, compiledFargateTemplate, [], true, SERVICE_NAME, 30, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying ECS Fargate Service '${stackName}'`);
    return new DeployContext(ownServiceContext);
}

export async function unPreDeploy(ownServiceContext: ServiceContext<FargateServiceConfig>): Promise<UnPreDeployContext> {
    return deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

export async function unDeploy(ownServiceContext: ServiceContext<FargateServiceConfig>): Promise<UnDeployContext> {
    return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedTypes = [];

export const producedDeployOutputTypes = [];

export const consumedDeployOutputTypes = [
    DeployOutputType.EnvironmentVariables,
    DeployOutputType.Policies,
    DeployOutputType.SecurityGroups
];

export const supportsTagging = true;
