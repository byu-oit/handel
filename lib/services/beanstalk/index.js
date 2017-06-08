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
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../common/account-config')().getAccountConfig();
const deployPhaseCommon = require('../../common/deploy-phase-common');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const deployableArtifact = require('./deployable-artifact');
const util = require('../../common/util');
const _ = require('lodash');

const SERVICE_NAME = "Beanstalk";

function getEbConfigurationOption(namespace, optionName, value) {
    return {
        namespace: namespace,
        optionName: optionName,
        value: value
    }
}

function getEnvVariablesToInject(serviceContext, dependenciesDeployContexts) {
    let serviceParams = serviceContext.params;
    let envVarsToInject = deployPhaseCommon.getEnvVarsFromDependencyDeployContexts(dependenciesDeployContexts);
    envVarsToInject = _.assign(envVarsToInject, deployPhaseCommon.getEnvVarsFromServiceContext(serviceContext));

    if (serviceParams.environment_variables) {
        envVarsToInject = _.assign(envVarsToInject, serviceParams.environment_variables);
    }
    return envVarsToInject;
}

function getEbExtensionScript(dependenciesDeployContexts) {
    let handlebarsParams = {
        dependencyScriptLines: []
    }
    for (let deployContext of dependenciesDeployContexts) {
        for (let script of deployContext.scripts) {
            //We have to split the scripts into line by line so that the ebextension YAML whitespace can be preserved.
            let scriptLines = script.replace(/\r\n/g, '\n').split('\n');
            handlebarsParams.dependencyScriptLines = handlebarsParams.dependencyScriptLines.concat(scriptLines);
        }
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/ebextension-template.config`, handlebarsParams);
}


function getCompiledBeanstalkTemplate(stackName, preDeployContext, serviceContext, dependenciesDeployContexts, serviceRole, s3ArtifactInfo) {
    let serviceParams = serviceContext.params;

    return getPolicyStatementsForInstanceRole(serviceContext, dependenciesDeployContexts)
        .then(policyStatements => {
            let handlebarsParams = {
                applicationName: stackName,
                applicationVersionBucket: s3ArtifactInfo.Bucket,
                applicationVersionKey: s3ArtifactInfo.Key,
                solutionStack: serviceParams.solution_stack,
                optionSettings: [],
                policyStatements
            };

            //Configure min and max size of ASG
            let minInstances = serviceParams.min_instances || 1;
            let maxInstances = serviceParams.max_instances || 1;
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:autoscaling:asg", "MinSize", minInstances));
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:autoscaling:asg", "MaxSize", maxInstances));

            //Configure launch configuration
            if (serviceParams.key_name) {
                handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:autoscaling:launchconfiguration", "EC2KeyName", serviceParams.key_name));
            }
            let instanceType = serviceParams.instance_type || "t2.micro";
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:autoscaling:launchconfiguration", "InstanceType", instanceType));
            let ebSecurityGroup = preDeployContext.securityGroups[0].GroupId;
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:autoscaling:launchconfiguration", "SecurityGroups", ebSecurityGroup));

            //Configure rolling updates
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:autoscaling:updatepolicy:rollingupdate", "RollingUpdateEnabled", true));

            //Configure VPC
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:ec2:vpc", "VPCId", accountConfig.vpc));
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:ec2:vpc", "Subnets", accountConfig.private_subnets.join(",")));
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:ec2:vpc", "ELBSubnets", accountConfig.public_subnets.join(",")));
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:ec2:vpc", "DBSubnets", accountConfig.data_subnets.join(",")));
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:ec2:vpc", "AssociatePublicIpAddress", false));

            //Add environment variables
            let envVarsToInject = getEnvVariablesToInject(serviceContext, dependenciesDeployContexts);
            for (let envVarName in envVarsToInject) {
                handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:elasticbeanstalk:application:environment", envVarName, envVarsToInject[envVarName]));
            }

            //Use enhanced metrics (shouldnt be extra $ unless we specify to send metrics to CloudWatch)
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:elasticbeanstalk:healthreporting:system", "SystemType", "enhanced"));

            //Set up routing
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:elasticbeanstalk:environment", "LoadBalancerType", "application"));
            let serviceRoleName = `${serviceRole.Path}${serviceRole.RoleName}`;
            if (serviceRoleName.startsWith('/')) { //Beanstalk doesnt like the leading slash, it just wants something like services/HandelBeanstalkServiceRole
                serviceRoleName = serviceRoleName.substr(1);
            }
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:elasticbeanstalk:environment", "ServiceRole", serviceRoleName));
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:elbv2:loadbalancer", "IdleTimeout", "300"));
            if (serviceParams.routing && serviceParams.routing.type === 'https') { //HTTPS ALB Listener
                handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:elbv2:listener:443", "Protocol", "HTTPS"));
                let certArn = `	arn:aws:acm:us-west-2:${accountConfig.account_id}:certificate/${serviceParams.routing.https_certificate}`;
                handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:elbv2:listener:443", "SSLCertificateArns", certArn));
                handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:elbv2:listener:default", "ListenerEnabled", "false"));
            }
            else { //HTTP ALB Listener
                handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:elbv2:listener:80", "Protocol", "HTTP"));
                handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:elbv2:listener:80", "ListenerEnabled", "true"));
            }

            //Set up health checking
            let healthCheckUrl = serviceParams.health_check_url || '/';
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:elasticbeanstalk:application", "Application Healthcheck URL", healthCheckUrl));
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:elasticbeanstalk:environment:process:default", "HealthCheckPath", healthCheckUrl));
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:elasticbeanstalk:environment:process:default", "Port", "80"));
            handlebarsParams.optionSettings.push(getEbConfigurationOption("aws:elasticbeanstalk:environment:process:default", "Protocol", "HTTP"));

            //Add tags (if present)
            if (serviceParams.tags) {
                handlebarsParams.tags = serviceParams.tags;
            }

            return handlebarsUtils.compileTemplate(`${__dirname}/beanstalk-template.yml`, handlebarsParams);
        });
}


function getDeployContext(serviceContext, cfStack) {
    return new DeployContext(serviceContext);
}

/**
 * This returns the policy needed for Beanstalk to work in the web
 * tier, including Docker ECS multi-container support
 */
function getPolicyStatementsForInstanceRole(serviceContext, dependenciesDeployContexts) {
    let ownPolicyStatementsTemplate = `${__dirname}/beanstalk-instance-role-statements.json`;
    let handlebarsParams = {
        region: accountConfig.region,
        accountId: accountConfig.account_id,
        appName: serviceContext.appName
    }
    return handlebarsUtils.compileTemplate(ownPolicyStatementsTemplate, handlebarsParams)
        .then(compiledPolicyStatements => {
            return JSON.parse(compiledPolicyStatements);
        })
        .then(ownPolicyStatements => {
            return ownPolicyStatements.concat(deployPhaseCommon.getAppSecretsAccessPolicyStatements(serviceContext));
        })
        .then(ownPolicyStatements => {
            return deployPhaseCommon.getAllPolicyStatementsForServiceRole(ownPolicyStatements, dependenciesDeployContexts);
        });
}

function getPolicyStatementsForServiceRole() {
    return JSON.parse(util.readFileSync(`${__dirname}/beanstalk-service-role-statements.json`));
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext) {
    let errors = [];

    //solution_stack required
    return errors;
}

exports.preDeploy = function (serviceContext) {
    let sgName = deployPhaseCommon.getResourceName(serviceContext);
    winston.info(`${SERVICE_NAME} - Executing PreDeploy on ${sgName}`);

    return preDeployPhaseCommon.createSecurityGroupForService(sgName, 22)
        .then(securityGroup => {
            winston.info(`${SERVICE_NAME} - Finished PreDeploy on ${sgName}`);
            let preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push(securityGroup);
            return preDeployContext;
        });
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`${SERVICE_NAME} - Bind is not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Executing Deploy on ${stackName}`);

    return deployPhaseCommon.createCustomRole('elasticbeanstalk.amazonaws.com', 'HandelBeanstalkServiceRole', getPolicyStatementsForServiceRole())
        .then(serviceRole => {
            return getEbExtensionScript(dependenciesDeployContexts)
                .then(ebextensionContent => {
                    let ebextensionFiles = {
                        '00handel-config.config': ebextensionContent
                    }
                    return deployableArtifact.prepareAndUploadDeployableArtifact(ownServiceContext, ebextensionFiles)
                        .then(s3ArtifactInfo => {
                            return getCompiledBeanstalkTemplate(stackName, ownPreDeployContext, ownServiceContext, dependenciesDeployContexts, serviceRole, s3ArtifactInfo);
                        });
                });
        })
        .then(compiledBeanstalkTemplate => {
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledBeanstalkTemplate, [], true, SERVICE_NAME);
        })
        .then(deployedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying '${stackName}'`);
            return getDeployContext(ownServiceContext, deployedStack);
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't consume events from other services`));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't produce events for other services`));
}

exports.unPreDeploy = function (ownServiceContext) {
    let sgName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Executing UnPreDeploy on ${sgName}`);

    return deletePhasesCommon.deleteSecurityGroupForService(sgName)
        .then(success => {
            winston.info(`${SERVICE_NAME} - Finished UnPreDeploy on ${sgName}`);
            return new UnPreDeployContext(ownServiceContext);
        });
}

exports.unBind = function (ownServiceContext) {
    winston.info(`${SERVICE_NAME} - UnBind is not required for this service`);
    return Promise.resolve(new UnBindContext(ownServiceContext));
}

exports.unDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unDeployCloudFormationStack(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [];

exports.consumedDeployOutputTypes = [
    'environmentVariables',
    'scripts',
    'policies',
    'credentials',
    'securityGroups'
];
