const winston = require('winston');
const ec2Calls = require('../../aws/ec2-calls');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../util/account-config')().getAccountConfig();
const taskDefTemplate = require('./task-def-template');
const ecsCalls = require('../../aws/ecs-calls');
const deployersCommon = require('../deployers-common');
const util = require('../../util/util');
const handlebarsUtils = require('../../util/handlebars-utils');
const cloudformationCalls = require('../../aws/cloudformation-calls');

function getUserDataScript(clusterName, dependenciesDeployContexts) {
    let variables = {
        ECS_CLUSTER_NAME: clusterName,
        DEPENDENCY_SCRIPTS: []
    }

    for(let deployContext of dependenciesDeployContexts) {
        for(let script of deployContext.scripts) {
            variables.DEPENDENCY_SCRIPTS.push(script);
        }
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/ecs-cluster-userdata-template.sh`, variables);
}


function getClusterStackParameters(clusterName, taskDefinitionArn, serviceContext, preDeployContext, dependenciesDeployContexts) {
    return getUserDataScript(clusterName, dependenciesDeployContexts)
        .then(userDataScript => {
            let minInstances = serviceContext.params.min_instances || 1;
            let maxInstances = serviceContext.params.max_instances || 1;
            let instanceType = serviceContext.params.instance_type || "t2.micro";
            let stackParameters = {
                ClusterName: clusterName,
                MinInstances: minInstances.toString(),
                MaxInstances: maxInstances.toString(),
                InstanceType: instanceType,
                KeyName: serviceContext.params.key_name,
                EcsSecurityGroup: preDeployContext.securityGroups[0].GroupId,
                AmiImageId: accountConfig.ecs_ami,
                UserData: new Buffer(userDataScript).toString('base64'),
                AsgSubnetIds: accountConfig.private_subnets.join(","),
                AsgCooldown: "300",
                DesiredCount: "2", //TODO - Change later to use real value
                TaskDefinitionArn: taskDefinitionArn,
                MinimumHealthyPercentDeployment: "50", //TODO - Change later to use real value
                AlbSubnets: accountConfig.public_subnets.join(","),
                ContainerName: clusterName,
                ContainerPort: serviceContext.params.port_mappings[0].toString(), //TODO - Support all port mappings?
                VpcId: accountConfig.vpc
            };
            return stackParameters;
        });
}

function createService(stackName, taskDefinitionArn, serviceContext, preDeployContext, dependenciesDeployContexts) {
    let clusterName = getShortenedClusterName(serviceContext);
    return getClusterStackParameters(clusterName, taskDefinitionArn, serviceContext, preDeployContext, dependenciesDeployContexts)
        .then(stackParameters => {
            let clusterTemplateBody = util.readFileSync(`${__dirname}/ecs-service.yml`);
            return cloudformationCalls.createStack(stackName, clusterTemplateBody, cloudformationCalls.getCfStyleStackParameters(stackParameters));
        });
}

function updateService(stackName, taskDefinitionArn, serviceContext, preDeployContext, dependenciesDeployContexts) {
    let clusterName = getShortenedClusterName(serviceContext);
    return getClusterStackParameters(clusterName, taskDefinitionArn, serviceContext, preDeployContext, dependenciesDeployContexts)
        .then(stackParameters => {
            let clusterTemplateBody = util.readFileSync(`${__dirname}/ecs-service.yml`);
            return cloudformationCalls.updateStack(stackName, clusterTemplateBody, cloudformationCalls.getCfStyleStackParameters(stackParameters));
        });
}

/**
 * This function creates a short resource name for the cluster. We don't use the standard cf stack name here because the max length
 *   of an ALB Target Group is 32 characters
 */
function getShortenedClusterName(serviceContext) {
    return `${serviceContext.appName.substring(0, 21)}-${serviceContext.environmentName.substring(0, 4)}-${serviceContext.serviceName.substring(0, 9)}`;
}


/**
 * Checks the service parameters for the deployable service in order to provide a 
 * fail-fast mechanism 
 */
exports.check = function(serviceContext) {
    let errors = [];
    let params = serviceContext.params;
    if(!params.port_mappings || params.port_mappings.length === 0) {
        errors.push("ECS - 'port_mappings' parameter is required");
    }
    return errors;
}

/**
 * 
 */
exports.preDeploy = function(serviceContext) {
    let sg_name = deployersCommon.getResourceName(serviceContext);
    winston.info(`ECS - Executing PreDeploy on ${sg_name}`);
    return ec2Calls.createSecurityGroupIfNotExists(sg_name, accountConfig['vpc'])
        .then(securityGroup => {
            //Add ingress from self
            return ec2Calls.addIngressRuleToSgIfNotExists(securityGroup, securityGroup, 'tcp', 0, 65535, accountConfig['vpc']);
        })
        .then(securityGroup => {
            //Add ingress from SSH bastion
            return ec2Calls.getSecurityGroupById(accountConfig.ssh_bastion_sg, accountConfig.vpc)
                .then(sshBastionSg => {
                    return ec2Calls.addIngressRuleToSgIfNotExists(sshBastionSg, securityGroup, 'tcp', 22, 22, accountConfig['vpc']);
                });
        })
        .then(securityGroup => {
            winston.info(`ECS - Finished PreDeploy on ${sg_name}`);
            let preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push(securityGroup);
            return preDeployContext;
        });
}

//Don't use this to create resources
exports.bind = function(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`ECS - Bind not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext));
}

/**
 * Deploy the instance of the service based on the service params passed in.
 */
exports.deploy = function(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`ECS - Deploying Cluster and Service ${stackName}`);
    let deployContext = new DeployContext(ownServiceContext);

    return deployersCommon.createCustomRoleForService("ecs-tasks.amazonaws.com", null, ownServiceContext, dependenciesDeployContexts)
        .then(role => {
            let taskDefinition = taskDefTemplate.getTaskDefinition(ownServiceContext, role.Arn, dependenciesDeployContexts);
            return ecsCalls.registerTaskDefinition(taskDefinition)
        })
        .then(taskDefinition => {
            return cloudformationCalls.getStack(stackName)
                .then(serviceStack => {
                    if(!serviceStack) { //Create 
                        winston.info(`Creating new ECS cluster ${stackName}`);
                        return createService(stackName, taskDefinition.taskDefinitionArn, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts);
                    }
                    else { //Update
                        //TODO - If user data changed, then cycle all instances in a safe manner (https://github.com/colinbjohnson/aws-missing-tools/blob/master/aws-ha-release/aws-ha-release.sh)
                        winston.info(`Updating existing ECS cluster ${stackName}`);
                        return updateService(stackName, taskDefinition.taskDefinitionArn, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts);
                    }
                })
                .then(serviceStack => {
                    winston.info(`ECS - Finished Deploying Cluster and Serivce ${stackName}`);
                    return deployContext;
                });
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
exports.consumeEvents = function(ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error("The ECS service doesn't consume events from other services"));
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
exports.produceEvents = function(ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error("The ECS service doesn't produce events for other services"));
}

/**
 * List of event sources this service can integrate with.
 * 
 * If the list is empty, this service cannot produce events to other services.
 */
exports.producedEventsSupportedServices = [];


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
    'securityGroups'
];