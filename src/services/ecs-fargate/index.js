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
const winston = require('winston');
const handlebarsUtils = require('../../common/handlebars-utils');
const DeployContext = require('../../datatypes').DeployContext;
const serviceAutoScalingSection = require('../../common/ecs-service-auto-scaling');
const containersSection = require('../../common/ecs-containers');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const volumesSection = require('../../common/ecs-volumes');
const routingSection = require('../../common/ecs-routing');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const ecsCalls = require('../../aws/ecs-calls');
const route53 = require('../../aws/route53-calls');

const SERVICE_NAME = "ECS Fargate";

function getTaskRoleStatements(serviceContext, dependenciesDeployContexts) {
    let ownPolicyStatements = deployPhaseCommon.getAppSecretsAccessPolicyStatements(serviceContext);

    return deployPhaseCommon.getAllPolicyStatementsForServiceRole(ownPolicyStatements, dependenciesDeployContexts);
}

function getCompiledEcsFargateTemplate(serviceName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let accountConfig = ownServiceContext.accountConfig;

    return Promise.all([route53.listHostedZones()])
        .then(results => {
            let [hostedZones] = results;
            let serviceParams = ownServiceContext.params;

            // Configure auto-scaling
            let autoScaling = serviceAutoScalingSection.getTemplateAutoScalingConfig(ownServiceContext, serviceName);

            // Configure containers in the task definition
            let containerConfigs = containersSection.getContainersConfig(ownServiceContext, dependenciesDeployContexts, serviceName);
            let oneOrMoreTasksHasRouting = routingSection.oneOrMoreTasksHasRouting(ownServiceContext);

            let logRetention = ownServiceContext.params.log_retention_in_days;

            //Create object used for templating the CloudFormation template
            let handlebarsParams = {
                serviceName,
                maxMb: serviceParams.max_mb || 512,
                cpuUnits: serviceParams.cpu_units || 256,
                ecsSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId,
                privateSubnetIds: accountConfig.private_subnets,
                publicSubnetIds: accountConfig.public_subnets,
                asgCooldown: "60", //This is set pretty short because we handle the instance-level auto-scaling from a Lambda that runs every minute.
                minimumHealthyPercentDeployment: "50", //TODO - Do we need to support more than just 50?
                vpcId: accountConfig.vpc,
                policyStatements: getTaskRoleStatements(ownServiceContext, dependenciesDeployContexts),
                deploymentSuffix: Math.floor(Math.random() * 10000), //ECS won't update unless something in the service changes.
                tags: deployPhaseCommon.getTags(ownServiceContext),
                containerConfigs,
                autoScaling,
                oneOrMoreTasksHasRouting,
                // This make it default to 'enabled'
                logGroupName: `${ownServiceContext.appName}-${ownServiceContext.environmentName}-${ownServiceContext.serviceName}`,
                //Default to not set, which means infinite.
                logRetentionInDays: logRetention !== 0 ? logRetention : null,
            };

            //Configure routing if present in any of the containers
            if (oneOrMoreTasksHasRouting) {
                handlebarsParams.loadBalancer = routingSection.getLoadBalancerConfig(serviceParams, containerConfigs, serviceName, hostedZones, accountConfig);
            }

            //Add volumes if present (these are consumed by one or more container mount points)
            handlebarsParams.volumes = volumesSection.getVolumes(dependenciesDeployContexts);

            return handlebarsUtils.compileTemplate(`${__dirname}/ecs-fargate-template.yml`, handlebarsParams)
        });
}


/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */
exports.check = function(serviceContext, dependenciesServiceContexts) {
    // TODO check that all values are valid, like Cpu and Memory, logRetentionInDays possible values at http://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutRetentionPolicy.html
    let errors = [];
    let params = serviceContext.params
    let retention = params.log_retention_in_days;

    if (retention && typeof retention !== 'number') {
        errors.push(`${SERVICE_NAME} - The 'log_retention_in_days' parameter must be a number`);
    }
    
    serviceAutoScalingSection.checkAutoScalingSection(serviceContext, SERVICE_NAME, errors);
    routingSection.checkLoadBalancerSection(serviceContext, SERVICE_NAME, errors);
    containersSection.checkContainers(serviceContext, SERVICE_NAME, errors);

    return errors;
}

exports.preDeploy = function (serviceContext) {
    return preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
}

exports.deploy = function(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying ECS Fargate Service '${stackName}'`);

    return ecsCalls.createDefaultClusterIfNotExists()
        .then(() => {
            return getCompiledEcsFargateTemplate(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
        })
        .then(compiledFargateTemplate => {
            let stackTags = deployPhaseCommon.getTags(ownServiceContext);
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledFargateTemplate, [], true, SERVICE_NAME, stackTags);
        })
        .then(deployedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying ECS Fargate Service '${stackName}'`);
            return new DeployContext(ownServiceContext)
        });
}

exports.unPreDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

exports.unDeploy = function(ownServiceContext) {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [];

exports.consumedDeployOutputTypes = [
    'environmentVariables',
    'policies',
    'securityGroups'
];
