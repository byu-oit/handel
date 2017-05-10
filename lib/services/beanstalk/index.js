const winston = require('winston');
const handlebarsUtils = require('../../util/handlebars-utils');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../util/account-config')().getAccountConfig();
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployersCommon = require('../deployers-common');
const ec2Calls = require('../../aws/ec2-calls');
const fs = require('fs');
const uuid = require('uuid');
const util = require('../../util/util');
const _ = require('lodash');

function getEbConfigurationOption(namespace, optionName, value) {
    return {
        namespace: namespace,
        optionName: optionName,
        value: value
    }
}

function getEnvVariablesToInject(serviceContext, dependenciesDeployContexts) {
    let serviceParams = serviceContext.params;
    let envVarsToInject = deployersCommon.getEnvVarsFromDependencyDeployContexts(dependenciesDeployContexts);
    envVarsToInject = _.assign(envVarsToInject, deployersCommon.getEnvVarsFromServiceContext(serviceContext));

    if (serviceParams.environment_variables) {
        envVarsToInject = _.assign(envVarsToInject, serviceParams.environment_variables);
    }
    return envVarsToInject;
}


function getCompiledBeanstalkTemplate(stackName, preDeployContext, serviceContext, dependenciesDeployContexts, instanceRole, serviceRole, s3ArtifactInfo) {
    let serviceParams = serviceContext.params;
    let handlebarsParams = {
        applicationName: stackName,
        beanstalkRoleName: instanceRole.RoleName,
        applicationVersionBucket: s3ArtifactInfo.Bucket,
        applicationVersionKey: s3ArtifactInfo.Key,
        solutionStack: serviceParams.solution_stack,
        optionSettings: []
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

    return handlebarsUtils.compileTemplate(`${__dirname}/beanstalk-template.yml`, handlebarsParams)
}

function getDeployContext(serviceContext, cfStack) {
    let deployContext = new DeployContext(serviceContext);
    return deployContext;
}

/**
 * This returns the policy needed for Beanstalk to work in the web
 * tier, including Docker ECS multi-container support
 */
function getPolicyStatementForInstanceRole(serviceContext) {
    let policyStatements = JSON.parse(util.readFileSync(`${__dirname}/beanstalk-instance-role-statements.json`));
    return policyStatements.concat(deployersCommon.getAppSecretsAccessPolicyStatements(serviceContext));
}

function getPolicyStatementForServiceRole() {
    return JSON.parse(util.readFileSync(`${__dirname}/beanstalk-service-role-statements.json`));
}

function uploadDeployableArtifactToS3(serviceContext) {
    let s3FileName = `beanstalk-deployable-${uuid()}.zip`;
    winston.info(`Uploading deployable artifact to S3: ${s3FileName}`);
    return deployersCommon.uploadDeployableArtifactToHandelBucket(serviceContext, s3FileName)
        .then(s3ArtifactInfo => {
            winston.info(`Uploaded deployable artifact to S3: ${s3FileName}`);
            return s3ArtifactInfo;
        });
}


/**
 * Checks the given service for required parameters and correctness. This provides
 * a fail-fast mechanism for configuration errors before deploy is attempted.
 *
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
 * @returns {Array} - 0 or more String error messages
 */
exports.check = function (serviceContext) {
    let errors = [];

    //solution_stack required
    return errors;
}


/**
 * Create resources needed for deployment that are also needed for dependency wiring
 * with other services
 *
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
 * @returns {Promise.<PreDeployContext>} - A Promise of the PreDeployContext results from the pre-deploy
 */
exports.preDeploy = function (serviceContext) {
    let sgName = deployersCommon.getResourceName(serviceContext);
    winston.info(`Beanstalk - Executing PreDeploy on ${sgName}`);

    return deployersCommon.createSecurityGroupForService(sgName, true)
        .then(securityGroup => {
            winston.info(`Beanstalk - Finished PreDeploy on ${sgName}`);
            let preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push(securityGroup);
            return preDeployContext;
        });
}

/**
 * Return the PreDeployContext for a service who is referencing your deployed service externally.
 * 
 * This method is the equivalent of preDeploy when someone else in another application is consuming
 * this service. This method takes the external dependency ServiceContext, and returns the PreDeployContext
 * for the external service. 
 * 
 * If PreDeploy has not been run yet for this service, this method should return an error. 
 * 
 * @param {ServiceContext} externalRefServiceContext - The ServiceContext of the external reference for which to get its PreDeployContext
 * @returns {Promise.<PreDeployContext>} - A Promise of the PreDeployContext results from the PreDeploy phase.
 */
exports.getPreDeployContextForExternalRef = function (externalRefServiceContext) {
    let sgName = deployersCommon.getResourceName(externalRefServiceContext);
    winston.info(`Beanstalk - Getting PreDeployContext for external reference ${sgName}`);

    return ec2Calls.getSecurityGroup(sgName, accountConfig.vpc)
        .then(securityGroup => {
            if (securityGroup) {
                let externalPreDeployContext = new PreDeployContext(externalRefServiceContext);
                externalPreDeployContext.securityGroups.push(securityGroup);
                return externalPreDeployContext;
            }
            throw new Error(`Beanstalk - Resources from PreDeploy not found!`);
        });
}


/**
 * Bind two resources from PreDeploy together by performing some wiring action on them. An example * is to add an ingress rule from one security group onto another. Wiring actions may also be
 * performed in the Deploy phase if there isn't a two-way linkage. For example, security groups
 * probably need to be done in PreDeploy and Bind, but environment variables from one service to
 * another can just be done in Deploy
 *
 * Bind is run from the perspective of the service being consumed, not the other way around.
 *
 * Do not use this phase for creating resources. Those should be done either in PreDeploy or Deploy.
 * This phase is for wiring up existing resources from PreDeploy
 *
 * @param {ServiceContext} ownServiceContext - The ServiceContext of the service being consumed
 * @param {PreDeployContext} ownPreDeployContext - The PreDeployContext of the service being consumed
 * @param {ServiceContext} dependentOfServiceContext - The ServiceContext of the service consuming this one
 * @param {PreDeployContext} dependentOfPreDeployContext - The PreDeployContext of the service consuming this one
 * @returns {Promise.<BindContext>} - A Promise of the BindContext results from the Bind
 */
exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`Beanstalk - Bind is not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
}

/**
 * Returns the BindContext for a service that is referenced externally in your deployed service.
 * 
 * This method is the equivalent of running Bind on an internal service when you are referencing
 * an external service. This method takes the external dependency ServiceContext and PreDeployContext,
 * as well as your deploying service's ServiceContext and PreDeployContext. It returns the
 * BindContext for the linkage of the two services.
 * 
 * If Bind has not yet been run on the external service, this method should return an error. 
 *
 * @param {ServiceContext} externalRefServiceContext - The ServiceContext of the external reference service that was bound to the depdendent service
 * @param {PreDeployContext} externalRefPreDeployContext - The PreDeployContext of the external reference service that was bound to the depdendent service
 * @param {ServiceContext} dependentOfServiceContext - The ServiceContext of the service being deployed that depends on the external service
 * @param {PreDeployContext} dependentOfPreDeployContext - The PreDeployContext of the service being deployed that depends on the external service
 * @returns {Promise.<BindContext>} - A Promise of the BindContext results from the Bind
 */
exports.getBindContextForExternalRef = function (externalRefServiceContext, externalRefPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`Beanstalk - Getting BindContext for external reference`);
    //No bind, so just return empty bind context
    return Promise.resolve(new BindContext(externalRefServiceContext, dependentOfServiceContext));
}


/**
 * Deploy the given resource, wiring it up with results from the DeployContexts of services
 * that this one depends on. All dependencies are guaranteed to be deployed before the ones
 * consuming them
 *
 * @param {ServiceContext} ownServiceContext - The ServiceContext of the service being deployed
 * @param {PreDeployContext} ownPreDeployContext - The PreDeployContext of the service being deployed
 * @param {Array<DeployContext>} dependenciesDeployContexts - The DeployContexts of the services that this one depends on
 * @returns {Promise.<DeployContext>} - A Promise of the DeployContext from this deploy
 */
exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`Beanstalk - Executing Deploy on ${stackName}`);

    return deployersCommon.createCustomRoleForService('ec2.amazonaws.com', getPolicyStatementForInstanceRole(ownServiceContext), ownServiceContext, dependenciesDeployContexts)
        .then(instanceRole => {
            return deployersCommon.createCustomRole('elasticbeanstalk.amazonaws.com', 'HandelBeanstalkServiceRole', getPolicyStatementForServiceRole())
                .then(serviceRole => {
                    return uploadDeployableArtifactToS3(ownServiceContext)
                        .then(s3ArtifactInfo => {
                            return getCompiledBeanstalkTemplate(stackName, ownPreDeployContext, ownServiceContext, dependenciesDeployContexts, instanceRole, serviceRole, s3ArtifactInfo);
                        });
                });
        })
        .then(compiledBeanstalkTemplate => {
            return cloudFormationCalls.getStack(stackName)
                .then(stack => {
                    if (!stack) {
                        winston.info(`Beanstalk - Creating Beanstalk app ${stackName}`);
                        return cloudFormationCalls.createStack(stackName, compiledBeanstalkTemplate, []);
                    }
                    else {
                        winston.info(`Beanstalk - Updating Beanstalk app ${stackName}`);
                        return cloudFormationCalls.updateStack(stackName, compiledBeanstalkTemplate, []);
                    }
                });
        })
        .then(deployedStack => {
            winston.info(`Beanstalk - Finished deploying Beanstalk app ${stackName}`);
            return getDeployContext(ownServiceContext, deployedStack);
        });
}

/**
 * Returns the DeployContext for a service who is being referenced externally from your application.
 * 
 * This method is the equivalent of deploy when you are consuming an external service. This
 * method takes the external dependency ServiceContext, and returns the DeployContext for
 * the external service. 
 * 
 * If Deploy has not been run yet for the external service, this method should return an error.
 * 
 * @param {ServiceContext} externalRefServiceContext - The ServiceContext of the external service for which to get the DeployContext
 * @returns {Promise.<DeployContext>} - A Promise of the DeployContext from this deploy
 */
exports.getDeployContextForExternalRef = function (externalRefServiceContext) {
    winston.info(`Beanstalk - Getting DeployContext for external reference`);
    let externalRefStackName = deployersCommon.getResourceName(externalRefServiceContext);
    return cloudFormationCalls.getStack(externalRefStackName)
        .then(externalStack => {
            if (externalStack) {
                return getDeployContext(externalRefServiceContext, externalStack);
            }
            throw new Error(`Beanstalk - Stack ${externalRefStackName} is not deployed!`);
        });
}

/**
 * In this phase, this service should make any changes necessary to allow it to consume events from the given source
 * For example, a Lambda consuming events from an SNS topic should add a Lambda Function Permission to itself to allow
 * the SNS ARN to invoke it.
 * 
 * Some events like DynamoDB -> Lambda will do all the work in here because Lambda uses a polling model to 
 *   DynamoDB, so the DynamoDB service doesn't need to do any configuration itself. Most services will only do half
 *   the work here, however, to grant permissions to the producing service. 
 * 
 * This method will only be called if your service is listed as an event consumer in another service's configuration.
 * 
 * Throw an exception in this method if your service doesn't consume any events at all.
 * 
 * @param {ServiceContext} ownServiceContext - The ServiceContext of this service consuming events
 * @param {DeployContext} ownDeployContext - The DeployContext of this service consuming events
 * @param {ServiceContext} producerServiceContext - The ServiceContext of the service that will be producing events for this service
 * @param {DeployContext} producerDeployContext - The DeployContext of the service that will be producing events for this service.
 * @returns {Promise.<ConsumeEventsContext>} - The information about the event consumption for this service
 */
exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error("The Beanstalk service doesn't consume events from other services"));
}

/**
 * Returns the ConsumeEventsContext for the given service consuming events from the given external service
 * 
 * This method is the equivalent of consumeEvents when you are consuming events from an external service.
 * This method takes the consumer's ServiceContext and DeployContext, as well as the external service
 * producer's ServiceContext and DeployContext.
 * 
 * If ConsumeEvents has not been run yet for the given service, this method should return an error.
 * 
 * @param {ServiceContext} ownServiceContext - The ServiceContext of this service consuming events
 * @param {DeployContext} ownDeployContext - The DeployContext of this service consuming events
 * @param {ServiceContext} externalRefServiceContext - The ServiceContext of the external service that is producing events for this service
 * @param {DeployContext} externalRefDeployContext - The DeployContext of the service that is producing events for this service
 * @returns {Promise.<ConsumeEventsContext>} - The information about the event consumption for this service
 */
exports.getConsumeEventsContextForExternalRef = function (ownServiceContext, ownDeployContext, externalRefServiceContext, externalRefDeployContext) {
    return Promise.reject(new Error("The Beanstalk service doesn't consume events from other services"));
}

/**
 * In this phase, this service should make any changes necessary to allow it to produce events to the consumer service.
 * For example, an S3 bucket producing events to a Lambda should add the event notifications to the S3 bucket for the
 * Lambda.
 * 
 * Some events, like DynamoDB -> Lambda, won't do any work here to produce events, because Lambda uses a polling
 *   model. In cases like these, you can just return 
 * 
 * This method will only be called if your service has an event_consumers element in its configruation.
 * 
 * Throw an exception in this method if your service doesn't produce any events to any sources.
 * 
 * @param {ServiceContext} ownServiceContext - The ServiceContext of this service producing events
 * @param {DeployContext} ownDeployContext - The DeployContext of this service producing events
 * @param {ServiceContext} producerServiceContext - The ServiceContext of the service that will be consuming events for this service
 * @param {DeployContext} producerDeployContext - The DeployContext of the service that will be consuming events for this service.
 * @returns {Promise.<ProduceEventsContext>} - The information about the event consumption for this service
 */
exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error("The Beanstalk service doesn't produce events for other services"));
}

/**
 * List of event sources this service can integrate with.
 * 
 * If the list is empty, this service cannot produce events to other services.
 */
exports.producedEventsSupportedServices = [];


/**
 * The list of output types that this service produces. 
 * 
 * If the list is empty, this service cannot be consumed by other resources.
 * 
 * Valid list values: environmentVariables, scripts, policies, credentials, securityGroups
 */
exports.producedDeployOutputTypes = [];

/**
 * The list of output types that this service consumes from other dependencies.
 * 
 * If the list is empty, this service cannot consume other services.
 * 
 * Valid list values: environmentVariables, scripts, policies, credentials, securityGroups
 */
exports.consumedDeployOutputTypes = [
    'environmentVariables',
    'scripts',
    'policies',
    'credentials',
    'securityGroups'
];
