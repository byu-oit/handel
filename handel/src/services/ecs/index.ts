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
import { DeployContext, PreDeployContext, ServiceConfig, ServiceContext } from 'handel-extension-api';
import * as extensionSupport from 'handel-extension-support';
import * as winston from 'winston';
import * as ec2Calls from '../../aws/ec2-calls';
import * as route53 from '../../aws/route53-calls';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as containersSection from '../../common/ecs-containers';
import * as routingSection from '../../common/ecs-routing';
import * as serviceAutoScalingSection from '../../common/ecs-service-auto-scaling';
import * as volumesSection from '../../common/ecs-volumes';
import * as asgCycling from './asg-cycling';
import * as cluster from './cluster';
import * as clusterAutoScalingSection from './cluster-auto-scaling';
import {EcsServiceConfig, HandlebarsEcsTemplateConfig} from './config-types';

const SERVICE_NAME = 'ECS';
const DEFAULT_INSTANCE_TYPE = 't2.micro';

function getTaskRoleStatements(serviceContext: ServiceContext<EcsServiceConfig>, dependenciesDeployContexts: DeployContext[]) {
    const ownPolicyStatements = deployPhaseCommon.getAppSecretsAccessPolicyStatements(serviceContext);
    return deployPhaseCommon.getAllPolicyStatementsForServiceRole(ownPolicyStatements, dependenciesDeployContexts);
}

function getLatestEcsAmiId() {
    return ec2Calls.getLatestAmiByName('amazon', 'amazon-ecs');
}

function getCompiledEcsTemplate(stackName: string, clusterName: string, ownServiceContext: ServiceContext<EcsServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[], userDataScript: string, ecsServiceRole: AWS.IAM.Role) {
    const accountConfig = ownServiceContext.accountConfig;

    return Promise.all([getLatestEcsAmiId(), route53.listHostedZones()])
        .then(results => {
            const [latestEcsAmi, hostedZones] = results;
            const serviceParams = ownServiceContext.params;
            let instanceType = DEFAULT_INSTANCE_TYPE;
            if (serviceParams.cluster && serviceParams.cluster.instance_type) {
                instanceType = serviceParams.cluster.instance_type;
            }

            // Configure auto-scaling
            const autoScaling = serviceAutoScalingSection.getTemplateAutoScalingConfig(ownServiceContext, clusterName);

            // Configure containers in the task definition
            const containerConfigs = containersSection.getContainersConfig(ownServiceContext, dependenciesDeployContexts, clusterName);
            const oneOrMoreTasksHasRouting = routingSection.oneOrMoreTasksHasRouting(ownServiceContext);

            const logRetention = ownServiceContext.params.log_retention_in_days;

            // Create object used for templating the CloudFormation template
            const handlebarsParams: HandlebarsEcsTemplateConfig = {
                clusterName,
                stackName,
                instanceType,
                minInstances: clusterAutoScalingSection.getInstanceCountForCluster(instanceType, autoScaling, containerConfigs, 'min', SERVICE_NAME),
                maxInstances: clusterAutoScalingSection.getInstanceCountForCluster(instanceType, autoScaling, containerConfigs, 'max', SERVICE_NAME),
                ecsSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId!,
                amiImageId: latestEcsAmi!.ImageId!,
                userData: new Buffer(userDataScript).toString('base64'),
                privateSubnetIds: accountConfig.private_subnets,
                publicSubnetIds: accountConfig.public_subnets,
                asgCooldown: '60', // This is set pretty short because we handel the instance-level auto-scaling from a Lambda that runs every minute.
                minimumHealthyPercentDeployment: '50', // TODO - Do we need to support more than just 50?
                vpcId: accountConfig.vpc,
                ecsServiceRoleArn: ecsServiceRole.Arn,
                policyStatements: getTaskRoleStatements(ownServiceContext, dependenciesDeployContexts),
                deploymentSuffix: Math.floor(Math.random() * 10000), // ECS won't update unless something in the service changes.
                tags: extensionSupport.tagging.getTags(ownServiceContext),
                containerConfigs,
                autoScaling,
                oneOrMoreTasksHasRouting,
                // This make it default to 'enabled'
                logging: ownServiceContext.params.logging !== 'disabled',
                logGroupName: `${ownServiceContext.appName}-${ownServiceContext.environmentName}-${ownServiceContext.serviceName}`,
                // Default to not set, which means infinite.
                logRetentionInDays: logRetention !== 0 ? logRetention! : null,
            };

            // Configure routing if present in any of hte containers
            if (oneOrMoreTasksHasRouting) {
                handlebarsParams.loadBalancer = routingSection.getLoadBalancerConfig(serviceParams, containerConfigs, clusterName, hostedZones, accountConfig);
            }

            // Add the SSH keypair if specified
            if (serviceParams.cluster && serviceParams.cluster.key_name) {
                handlebarsParams.sshKeyName = serviceParams.cluster.key_name;
            }

            // Add volumes if present (these are consumed by one or more container mount points)
            handlebarsParams.volumes = volumesSection.getVolumes(dependenciesDeployContexts);

            return extensionSupport.handlebars.compileTemplate(`${__dirname}/ecs-service-template.yml`, handlebarsParams);
        });
}

/**
 * This function creates a short resource name for the cluster. We don't use the standard cf stack name here because the max length
 *   of an ALB Target Group is 32 characters
 */
function getShortenedClusterName(serviceContext: ServiceContext<EcsServiceConfig>) {
    return `${serviceContext.appName.substring(0, 21)}-${serviceContext.environmentName.substring(0, 4)}-${serviceContext.serviceName.substring(0, 9)}`;
}

function checkLogging(serviceContext: ServiceContext<EcsServiceConfig>, serviceName: string, errors: string[]) {
    const params = serviceContext.params;

    const logging = params.logging;
    const retention = params.log_retention_in_days;

    if (logging && !(logging === 'enabled' || logging === 'disabled')) {
        errors.push(`${serviceName} - The 'logging' parameter must be either 'enabled' or 'disabled'`);
    }
    if (retention && typeof retention !== 'number') {
        errors.push(`${serviceName} - The 'log_retention_in_days' parameter must be a number`);
    }
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */
export function check(serviceContext: ServiceContext<EcsServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors: string[] = [];

    serviceAutoScalingSection.checkAutoScalingSection(serviceContext, SERVICE_NAME, errors);
    routingSection.checkLoadBalancerSection(serviceContext, SERVICE_NAME, errors);
    containersSection.checkContainers(serviceContext, SERVICE_NAME, errors);
    checkLogging(serviceContext, SERVICE_NAME, errors);

    return errors;
}

export async function preDeploy(serviceContext: ServiceContext<EcsServiceConfig>) {
    return extensionSupport.preDeployPhase.preDeployCreateSecurityGroup(serviceContext, 22, SERVICE_NAME);
}

export async function deploy(ownServiceContext: ServiceContext<EcsServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]) {
    const stackName = ownServiceContext.getResourceName();
    winston.info(`${SERVICE_NAME} - Deploying service '${stackName}'`);

    const clusterName = getShortenedClusterName(ownServiceContext);
    const instancesToCycle = await asgCycling.getInstancesToCycle(ownServiceContext, DEFAULT_INSTANCE_TYPE);
    await clusterAutoScalingSection.createAutoScalingLambdaIfNotExists(ownServiceContext.accountConfig);
    await clusterAutoScalingSection.createDrainingLambdaIfNotExists(ownServiceContext.accountConfig);
    const userDataScript = await cluster.getUserDataScript(clusterName, dependenciesDeployContexts);
    const ecsServiceRole = await cluster.createEcsServiceRoleIfNotExists(ownServiceContext.accountConfig);
    const compiledTemplate = await getCompiledEcsTemplate(stackName, clusterName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, userDataScript, ecsServiceRole!);
    const stackTags = extensionSupport.tagging.getTags(ownServiceContext);
    const deployedStack = await deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME, 30, stackTags);
    await asgCycling.cycleInstances(instancesToCycle);
    winston.info(`${SERVICE_NAME} - Finished deploying service '${stackName}'`);
    return new DeployContext(ownServiceContext);
}

export async function unPreDeploy(ownServiceContext: ServiceContext<EcsServiceConfig>) {
    return extensionSupport.deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

export async function unDeploy(ownServiceContext: ServiceContext<EcsServiceConfig>) {
    return extensionSupport.deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = [];

export const consumedDeployOutputTypes = [
    'environmentVariables',
    'scripts',
    'policies',
    'securityGroups'
];

export const supportsTagging = true;
