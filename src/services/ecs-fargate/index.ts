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
import * as winston from 'winston';
import * as ecsCalls from '../../aws/ecs-calls';
import * as route53 from '../../aws/route53-calls';
import * as deletePhasesCommon from '../../common/delete-phases-common';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as containersSection from '../../common/ecs-containers';
import * as routingSection from '../../common/ecs-routing';
import * as serviceAutoScalingSection from '../../common/ecs-service-auto-scaling';
import * as volumesSection from '../../common/ecs-volumes';
import * as handlebarsUtils from '../../common/handlebars-utils';
import * as preDeployPhaseCommon from '../../common/pre-deploy-phase-common';
import { DeployContext, PreDeployContext, ServiceConfig, ServiceContext } from '../../datatypes';
import { FargateServiceConfig, HandlebarsFargateTemplateConfig } from './config-types';

const SERVICE_NAME = 'ECS Fargate';

function getTaskRoleStatements(serviceContext: ServiceContext<FargateServiceConfig>, dependenciesDeployContexts: DeployContext[]) {
    const ownPolicyStatements = deployPhaseCommon.getAppSecretsAccessPolicyStatements(serviceContext);
    return deployPhaseCommon.getAllPolicyStatementsForServiceRole(ownPolicyStatements, dependenciesDeployContexts);
}

async function getCompiledEcsFargateTemplate(serviceName: string, ownServiceContext: ServiceContext<FargateServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<string> {
    const accountConfig = ownServiceContext.accountConfig;

    return Promise.all([route53.listHostedZones()])
        .then(results => {
            const [ hostedZones ] = results;
            const serviceParams = ownServiceContext.params;

            // Configure auto-scaling
            const autoScaling = serviceAutoScalingSection.getTemplateAutoScalingConfig(ownServiceContext, serviceName);

            // Configure containers in the task definition
            const containerConfigs = containersSection.getContainersConfig(ownServiceContext, dependenciesDeployContexts, serviceName);
            const oneOrMoreTasksHasRouting = routingSection.oneOrMoreTasksHasRouting(ownServiceContext);

            const logRetention = ownServiceContext.params.log_retention_in_days;

            // Create object used for templating the CloudFormation template
            const handlebarsParams: HandlebarsFargateTemplateConfig = {
                serviceName,
                maxMb: serviceParams.max_mb || 512,
                cpuUnits: serviceParams.cpu_units || 256,
                ecsSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId!,
                privateSubnetIds: accountConfig.private_subnets,
                publicSubnetIds: accountConfig.public_subnets,
                asgCooldown: '60', // This is set pretty short because we handle the instance-level auto-scaling from a Lambda that runs every minute.
                minimumHealthyPercentDeployment: '50', // TODO - Do we need to support more than just 50?
                vpcId: accountConfig.vpc,
                policyStatements: getTaskRoleStatements(ownServiceContext, dependenciesDeployContexts),
                deploymentSuffix: Math.floor(Math.random() * 10000), // ECS won't update unless something in the service changes.
                tags: deployPhaseCommon.getTags(ownServiceContext),
                containerConfigs,
                autoScaling,
                oneOrMoreTasksHasRouting,
                // This make it default to 'enabled'
                logGroupName: `${ownServiceContext.appName}-${ownServiceContext.environmentName}-${ownServiceContext.serviceName}`,
                // Default to not set, which means infinite.
                logRetentionInDays: logRetention !== 0 ? logRetention! : null,
            };

            // Configure routing if present in any of the containers
            if (oneOrMoreTasksHasRouting) {
                handlebarsParams.loadBalancer = routingSection.getLoadBalancerConfig(serviceParams, containerConfigs, serviceName, hostedZones, accountConfig);
            }

            // Add volumes if present (these are consumed by one or more container mount points)
            handlebarsParams.volumes = volumesSection.getVolumes(dependenciesDeployContexts);

            return handlebarsUtils.compileTemplate(`${__dirname}/ecs-fargate-template.yml`, handlebarsParams);
        });
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

    serviceAutoScalingSection.checkAutoScalingSection(serviceContext, SERVICE_NAME, errors);
    routingSection.checkLoadBalancerSection(serviceContext, SERVICE_NAME, errors);
    containersSection.checkContainers(serviceContext, SERVICE_NAME, errors);

    return errors;
}

export async function preDeploy(serviceContext: ServiceContext<FargateServiceConfig>) {
    return preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
}

export async function deploy(ownServiceContext: ServiceContext<FargateServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]) {
    const stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying ECS Fargate Service '${stackName}'`);

    await ecsCalls.createDefaultClusterIfNotExists();
    const compiledFargateTemplate = await getCompiledEcsFargateTemplate(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts);
    const stackTags = deployPhaseCommon.getTags(ownServiceContext);
    const deployedStack = await deployPhaseCommon.deployCloudFormationStack(stackName, compiledFargateTemplate, [], true, SERVICE_NAME, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying ECS Fargate Service '${stackName}'`);
    return new DeployContext(ownServiceContext);
}

export async function unPreDeploy(ownServiceContext: ServiceContext<FargateServiceConfig>) {
    return deletePhasesCommon.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

export async function unDeploy(ownServiceContext: ServiceContext<FargateServiceConfig>) {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = [];

export const consumedDeployOutputTypes = [
    'environmentVariables',
    'policies',
    'securityGroups'
];
