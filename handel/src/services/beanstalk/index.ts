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
    EnvironmentVariables,
    PreDeployContext,
    ServiceConfig,
    ServiceContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import * as _ from 'lodash';
import * as winston from 'winston';
import * as route53 from '../../aws/route53-calls';
import * as deletePhasesCommon from '../../common/delete-phases-common';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as handlebarsUtils from '../../common/handlebars-utils';
import * as instanceAutoScaling from '../../common/instance-auto-scaling';
import * as preDeployPhaseCommon from '../../common/pre-deploy-phase-common';
import {getTags} from '../../common/tagging-common';
import * as util from '../../common/util';
import {
    BeanstalkServiceConfig,
    EbextensionsToInject,
    HandlebarsBeanstalkAutoScalingTemplate,
    HandlebarsBeanstalkOptionSetting,
    HandlebarsBeanstalkTemplate
} from './config-types';
import * as deployableArtifact from './deployable-artifact';

const SERVICE_NAME = 'Beanstalk';

function getEbConfigurationOption(namespace: string, optionName: string, value: string | number | boolean): HandlebarsBeanstalkOptionSetting {
    return {
        namespace: namespace,
        optionName: optionName,
        value: value
    };
}

function getEnvVariablesToInject(serviceContext: ServiceContext<BeanstalkServiceConfig>, dependenciesDeployContexts: DeployContext[]): EnvironmentVariables {
    const serviceParams = serviceContext.params;
    let envVarsToInject = deployPhaseCommon.getEnvVarsFromDependencyDeployContexts(dependenciesDeployContexts);
    envVarsToInject = _.assign(envVarsToInject, deployPhaseCommon.getEnvVarsFromServiceContext(serviceContext));

    if (serviceParams.environment_variables) {
        envVarsToInject = _.assign(envVarsToInject, serviceParams.environment_variables);
    }
    return envVarsToInject;
}

function getDependenciesEbExtensionScript(dependenciesDeployContexts: DeployContext[]): Promise<string> {
    const handlebarsParams: any = {
        dependencyScriptLines: []
    };
    for (const deployContext of dependenciesDeployContexts) {
        for (const script of deployContext.scripts) {
            // We have to split the scripts into line by line so that the ebextension YAML whitespace can be preserved.
            const scriptLines = script.replace(/\r\n/g, '\n').split('\n');
            handlebarsParams.dependencyScriptLines = handlebarsParams.dependencyScriptLines.concat(scriptLines);
        }
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/dependencies-ebextension-template.config`, handlebarsParams);
}

async function getCompiledBeanstalkTemplate(stackName: string, preDeployContext: PreDeployContext, serviceContext: ServiceContext<BeanstalkServiceConfig>, dependenciesDeployContexts: DeployContext[], serviceRole: AWS.IAM.Role, s3ArtifactInfo: AWS.S3.ManagedUpload.SendData): Promise<string> {
    const serviceParams = serviceContext.params;
    const accountConfig = serviceContext.accountConfig;

    const descVer = serviceParams.description || 'Application for ' + stackName;
    const policyStatements = await getPolicyStatementsForInstanceRole(serviceContext, dependenciesDeployContexts);
    const handlebarsParams: HandlebarsBeanstalkTemplate = {
        applicationName: stackName,
        applicationVersionBucket: s3ArtifactInfo.Bucket,
        applicationVersionKey: s3ArtifactInfo.Key,
        description: descVer,
        solutionStack: serviceParams.solution_stack,
        optionSettings: [],
        policyStatements,
        tags: getTags(serviceContext)
    };

    // Configure min and max size of ASG
    let minInstances;
    let maxInstances;
    if (serviceParams.auto_scaling) {
        minInstances = serviceParams.auto_scaling.min_instances || 1;
        maxInstances = serviceParams.auto_scaling.max_instances || 1;
    }
    else {
        // TODO - serviceParams.min_instances is deprecated. Use serviceParams.auto_scaling.min_instances instead and take the old kind out at some point
        winston.warn('You are using the min_instances and max_instances at the service level, which is deprecated. Please put them inside the \'auto_scaling\' section instead');
        minInstances = serviceParams.min_instances || 1;
        maxInstances = serviceParams.max_instances || 1;
    }

    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:autoscaling:asg', 'MinSize', minInstances));
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:autoscaling:asg', 'MaxSize', maxInstances));

    // Configure launch configuration
    if (serviceParams.key_name) {
        handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:autoscaling:launchconfiguration', 'EC2KeyName', serviceParams.key_name));
    }
    const instanceType = serviceParams.instance_type || 't2.micro';
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:autoscaling:launchconfiguration', 'InstanceType', instanceType));
    const ebSecurityGroup = preDeployContext.securityGroups[0].GroupId!;
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:autoscaling:launchconfiguration', 'SecurityGroups', ebSecurityGroup));

    // Configure rolling updates
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:autoscaling:updatepolicy:rollingupdate', 'RollingUpdateEnabled', true));

    // Configure VPC
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:ec2:vpc', 'VPCId', accountConfig.vpc));
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:ec2:vpc', 'Subnets', accountConfig.private_subnets.join(',')));
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:ec2:vpc', 'ELBSubnets', accountConfig.public_subnets.join(',')));
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:ec2:vpc', 'DBSubnets', accountConfig.data_subnets.join(',')));
    // handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:ec2:vpc", "AssociatePublicIpAddress", false));

    // Add environment variables
    const envVarsToInject = getEnvVariablesToInject(serviceContext, dependenciesDeployContexts);
    for (const envVarName in envVarsToInject) {
        if (envVarsToInject.hasOwnProperty(envVarName)) {
            handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:elasticbeanstalk:application:environment', envVarName, envVarsToInject[envVarName]));
        }
    }

    // Use enhanced metrics (shouldnt be extra $ unless we specify to send metrics to CloudWatch)
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:elasticbeanstalk:healthreporting:system', 'SystemType', 'enhanced'));

    // Set up routing
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:elasticbeanstalk:environment', 'LoadBalancerType', 'application'));
    let serviceRoleName = `${serviceRole.Path}${serviceRole.RoleName}`;
    if (serviceRoleName.startsWith('/')) { // Beanstalk doesnt like the leading slash, it just wants something like services/HandelBeanstalkServiceRole
        serviceRoleName = serviceRoleName.substr(1);
    }
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:elasticbeanstalk:environment', 'ServiceRole', serviceRoleName));
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:elbv2:loadbalancer', 'IdleTimeout', '300'));
    if (serviceParams.routing && serviceParams.routing.type === 'https') { // HTTPS ALB Listener
        handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:elbv2:listener:443', 'Protocol', 'HTTPS'));
        const certArn = `arn:aws:acm:${accountConfig.region}:${accountConfig.account_id}:certificate/${serviceParams.routing.https_certificate}`;
        handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:elbv2:listener:443', 'SSLCertificateArns', certArn));
        handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:elbv2:listener:default', 'ListenerEnabled', 'false'));
    }
    else { // HTTP ALB Listener
        handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:elbv2:listener:80', 'Protocol', 'HTTP'));
        handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:elbv2:listener:80', 'ListenerEnabled', 'true'));
    }

    // Set up health checking
    const healthCheckUrl = serviceParams.health_check_url || '/';
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:elasticbeanstalk:application', 'Application Healthcheck URL', healthCheckUrl));
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:elasticbeanstalk:environment:process:default', 'HealthCheckPath', healthCheckUrl));
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:elasticbeanstalk:environment:process:default', 'Port', '80'));
    handlebarsParams.optionSettings.push(getEbConfigurationOption('aws:elasticbeanstalk:environment:process:default', 'Protocol', 'HTTP'));

    // If the user has specified auto-scaling configurations, it will be done in a system-injected EBExtension file, not in the environment itself

    return handlebarsUtils.compileTemplate(`${__dirname}/beanstalk-template.yml`, handlebarsParams);
}

function getDeployContext(serviceContext: ServiceContext<BeanstalkServiceConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    return new DeployContext(serviceContext);
}

/**
 * This returns the policy needed for Beanstalk to work in the web
 * tier, including Docker ECS multi-container support
 */
async function getPolicyStatementsForInstanceRole(serviceContext: ServiceContext<ServiceConfig>, dependenciesDeployContexts: DeployContext[]): Promise<any[]> {
    const accountConfig = serviceContext.accountConfig;

    const ownPolicyStatementsTemplate = `${__dirname}/beanstalk-instance-role-statements.json`;
    const handlebarsParams = {
        region: accountConfig.region,
        accountId: accountConfig.account_id,
        appName: serviceContext.appName
    };
    const compiledPolicyStatements = await handlebarsUtils.compileTemplate(ownPolicyStatementsTemplate, handlebarsParams);
    let ownPolicyStatements = JSON.parse(compiledPolicyStatements);
    ownPolicyStatements = ownPolicyStatements.concat(deployPhaseCommon.getAppSecretsAccessPolicyStatements(serviceContext));
    return deployPhaseCommon.getAllPolicyStatementsForServiceRole(ownPolicyStatements, dependenciesDeployContexts);
}

function getPolicyStatementsForServiceRole() {
    return JSON.parse(util.readFileSync(`${__dirname}/beanstalk-service-role-statements.json`));
}

function getAutoScalingEbExtension(stackName: string, ownServiceContext: ServiceContext<BeanstalkServiceConfig>): Promise<string> {
    const serviceParams = ownServiceContext.params;

    const handlebarsParams: HandlebarsBeanstalkAutoScalingTemplate = {
        stackName,
        scalingPolicies: instanceAutoScaling.getScalingPoliciesConfig(ownServiceContext)
    };

    if (serviceParams.auto_scaling && serviceParams.auto_scaling.scaling_policies) {
        return handlebarsUtils.compileTemplate(`${__dirname}/autoscaling-ebextension-template.yml`, handlebarsParams);
    }
    else {
        throw new Error('Attempted to generate auto-scaling EbExtensions file but no scaling policies are defined in the Handel file');
    }
}

async function getDnsNameEbExtension(ownServiceContext: ServiceContext<BeanstalkServiceConfig>): Promise<string> {
    const serviceParams = ownServiceContext.params;

    if (serviceParams.routing && serviceParams.routing.dns_names) {
        const dnsNames = serviceParams.routing.dns_names;

        const zones = await route53.listHostedZones();
        const namesParam = dnsNames.map(name => {
            return {
                name: name,
                zoneId: route53.getBestMatchingHostedZone(name, zones)!.Id, // TODO - I think this is a bug, it can indeed be undefined, causing .Id to fail. We should handle this better
            };
        });

        const handlebarsParams = {
            names: namesParam
        };
        return handlebarsUtils.compileTemplate(`${__dirname}/dns-names-ebextension-template.yml`, handlebarsParams);
    }
    else {
        throw new Error('Attempted to generate auto-scaling DNS names file but no DNS names are defined in the Handel file');
    }
}

async function getSystemInjectedEbExtensions(stackName: string, ownServiceContext: ServiceContext<BeanstalkServiceConfig>, dependenciesDeployContexts: DeployContext[]): Promise<EbextensionsToInject> {
    const serviceParams = ownServiceContext.params;
    const ebextensions: EbextensionsToInject = {};

    // Get ebextension for dependencies
    const dependenciesEbExtensionContent = await getDependenciesEbExtensionScript(dependenciesDeployContexts);
    ebextensions['01handel-config.config'] = dependenciesEbExtensionContent;

    // Get ebextension for auto-scaling (if present)
    if (serviceParams.auto_scaling && serviceParams.auto_scaling.scaling_policies) {
        const scalingEbextensionContent = await getAutoScalingEbExtension(stackName, ownServiceContext);
        ebextensions['00auto-scaling.config'] = scalingEbextensionContent;
    }

    // Get ebextension for DNS names (if present)
    if (serviceParams.routing && serviceParams.routing.dns_names) {
        const dnsNameEbextensionContent = await getDnsNameEbExtension(ownServiceContext);
        ebextensions['02dns-names.config'] = dnsNameEbextensionContent;
    }

    return ebextensions;
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<BeanstalkServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors = [];
    const params = serviceContext.params;

    // TODO - Implement check method

    // solution_stack required

    if (params.routing && params.routing.dns_names) {
        const badName = params.routing.dns_names.some(it => !route53.isValidHostname(it));
        if (badName) {
            errors.push(`${SERVICE_NAME} - 'dns_names' values must be valid hostnames`);
        }
    }
    return errors;
}

export async function preDeploy(serviceContext: ServiceContext<BeanstalkServiceConfig>): Promise<PreDeployContext> {
    return preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, 22, SERVICE_NAME);
}

export async function deploy(ownServiceContext: ServiceContext<BeanstalkServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying Beanstalk application '${stackName}'`);

    const serviceRole = await deployPhaseCommon.createCustomRole('elasticbeanstalk.amazonaws.com', 'HandelBeanstalkServiceRole', getPolicyStatementsForServiceRole(), ownServiceContext.accountConfig);
    if (!serviceRole) {
        throw new Error('Could not create Beanstalk service role');
    }
    const ebextensionFiles = await getSystemInjectedEbExtensions(stackName, ownServiceContext, dependenciesDeployContexts);
    const s3ArtifactInfo = await deployableArtifact.prepareAndUploadDeployableArtifact(ownServiceContext, ebextensionFiles);
    const compiledBeanstalkTemplate = await getCompiledBeanstalkTemplate(stackName, ownPreDeployContext, ownServiceContext, dependenciesDeployContexts, serviceRole, s3ArtifactInfo);
    const stackTags = getTags(ownServiceContext);
    const deployedStack = await deployPhaseCommon.deployCloudFormationStack(stackName, compiledBeanstalkTemplate, [], true, SERVICE_NAME, 30, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying Beanstalk application '${stackName}'`);
    return getDeployContext(ownServiceContext, deployedStack);
}

export async function unPreDeploy(ownServiceContext: ServiceContext<BeanstalkServiceConfig>): Promise<UnPreDeployContext> {
    return deletePhasesCommon.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

export async function unDeploy(ownServiceContext: ServiceContext<BeanstalkServiceConfig>): Promise<UnDeployContext> {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = [];

export const consumedDeployOutputTypes = [
    'environmentVariables',
    'scripts',
    'policies',
    'credentials',
    'securityGroups'
];

export const supportsTagging = true;
