const winston = require('winston');
const ec2Calls = require('../../aws/ec2-calls');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../util/account-config')().getAccountConfig();
const iamCalls = require('../../aws/iam-calls');
const deployersCommon = require('../deployers-common');
const util = require('../../util/util');
const handlebarsUtils = require('../../util/handlebars-utils');
const cloudformationCalls = require('../../aws/cloudformation-calls');
const _ = require('lodash');

//Values are specified in MiB
const EC2_INSTANCE_MEMORY_MAP = {
    "t2.nano": "500",
    "t2.micro": "1000",
    "t2.small": "2000",
    "t2.medium": "4000",
    "t2.large": "8000",
    "t2.xlarge": "16000",
    "t2.2xlarge": "32000",
    "m1.small": "1700",
    "m1.medium": "3750",
    "m1.large": "7500",
    "m1.xlarge": "15000",
    "m2.xlarge": "17100",
    "m2.2xlarge": "34200",
    "m2.4xlarge": "68400",
    "m4.large": "8000",
    "m4.xlarge": "16000",
    "m4.2xlarge": "32000",
    "m4.3xlarge": "64000",
    "m4.10xlarge": "160000",
    "m4.16xlarge": "256000",
    "m3.medium": "3750",
    "m3.large": "7500",
    "m3.xlarge": "15000",
    "m3.2xlarge": "30000",
    "c1.medium": "1700",
    "c1.xlarge": "7000",
    "c4.large": "3750",
    "c4.xlarge": "7500",
    "c4.2xlarge": "15000",
    "c4.4xlarge": "30000",
    "c4.8xlarge": "60000",
    "c3.large": "3750",
    "c3.xlarge": "7500",
    "c3.2xlarge": "15000",
    "c3.4xlarge": "30000",
    "c3.8xlarge": "60000",
    "r4.large": "15250",
    "r4.xlarge": "30500",
    "r4.2xlarge": "61000",
    "r4.4xlarge": "122000",
    "r4.8xlarge": "240000",
    "r4.16xlarge": "488000",
    "r3.large": "15250",
    "r3.xlarge": "30500",
    "r3.2xlarge": "61000",
    "r3.4xlarge": "122000",
    "r3.8xlarge": "244000",
    "i3.large": "15250",
    "i3.xlarge": "30500",
    "i3.2xlarge": "61000",
    "i3.4xlarge": "122000",
    "i3.8xlarge": "244000",
    "i3.16xlarge": "488000"
}

function getInstanceCountForCluster(instanceType, containerInstances, containerMaxMemory) {
    let instanceMemory = EC2_INSTANCE_MEMORY_MAP[instanceType];
    if (!instanceMemory) {
        throw new Error(`ECS - Unhandled instance type specified: ${instanceType}`);
    }
    let maxInstanceMemoryToUse = instanceMemory * .5; //Fill up instances to 50% of capacity (allows for deployments)

    let numInstances = 1; //Need at least one instance
    let currentInstanceMem = 0;
    for (let i = 0; i < containerInstances; i++) {
        if ((currentInstanceMem + containerMaxMemory) > maxInstanceMemoryToUse) {
            numInstances += 1;
            currentInstanceMem = 0;
        }
        currentInstanceMem += containerMaxMemory;
    }

    return numInstances;
}

function getUserDataScript(clusterName, dependenciesDeployContexts) {
    let variables = {
        ECS_CLUSTER_NAME: clusterName,
        DEPENDENCY_SCRIPTS: []
    }

    for (let deployContext of dependenciesDeployContexts) {
        for (let script of deployContext.scripts) {
            variables.DEPENDENCY_SCRIPTS.push(script);
        }
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/ecs-cluster-userdata-template.sh`, variables);
}

function createEcsServiceRoleIfNotExists() {
    let roleName = 'HandelEcsServiceRole';
    return iamCalls.createRoleIfNotExists(roleName, 'ecs.amazonaws.com')
        .then(role => {
            let policyArn = `arn:aws:iam::${accountConfig.account_id}:policy/services/${roleName}`;
            let policyDocument = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": [
                            "ec2:AuthorizeSecurityGroupIngress",
                            "ec2:Describe*",
                            "elasticloadbalancing:DeregisterInstancesFromLoadBalancer",
                            "elasticloadbalancing:DeregisterTargets",
                            "elasticloadbalancing:Describe*",
                            "elasticloadbalancing:RegisterInstancesWithLoadBalancer",
                            "elasticloadbalancing:RegisterTargets"
                        ],
                        "Resource": "*"
                    }
                ]
            }
            return iamCalls.createPolicyIfNotExists(roleName, policyArn, policyDocument);
        })
        .then(policy => {
            return iamCalls.attachPolicyToRole(policy.Arn, roleName);
        })
        .then(policyAttachment => {
            return iamCalls.getRole(roleName);
        });
}


function getClusterStackParameters(clusterName, serviceContext, preDeployContext, dependenciesDeployContexts) {
    return getUserDataScript(clusterName, dependenciesDeployContexts)
        .then(userDataScript => {
            return deployersCommon.createCustomRoleForService("ecs-tasks.amazonaws.com", deployersCommon.getAppSecretsAccessPolicyStatements(serviceContext), serviceContext, dependenciesDeployContexts)
                .then(taskRole => {
                    return createEcsServiceRoleIfNotExists()
                        .then(ecsServiceRole => {
                            let serviceParams = serviceContext.params;
                            let minContainers = serviceParams.min_containers || 1;
                            let maxContainers = serviceParams.max_containers || 2;
                            let instanceType = serviceParams.instance_type || "t2.micro";
                            let maxMb = serviceParams.max_mb || 128;
                            let minInstances = getInstanceCountForCluster(instanceType, minContainers, maxMb);
                            let maxInstances = getInstanceCountForCluster(instanceType, maxContainers, maxMb);
                            let imageName = `${accountConfig.account_id}.dkr.ecr.${accountConfig.region}.amazonaws.com/${serviceContext.appName}-${serviceContext.serviceName}:${serviceContext.environmentName}`
                            let cpuUnits = serviceParams.cpu_units || 100;

                            let stackParameters = {
                                ClusterName: clusterName,
                                MinInstances: minInstances.toString(),
                                MaxInstances: maxInstances.toString(),
                                InstanceType: instanceType,
                                EcsSecurityGroup: preDeployContext.securityGroups[0].GroupId,
                                AmiImageId: accountConfig.ecs_ami,
                                UserData: new Buffer(userDataScript).toString('base64'),
                                AsgSubnetIds: accountConfig.private_subnets.join(","),
                                AsgCooldown: "300",
                                DesiredCount: minContainers.toString(),
                                MinimumHealthyPercentDeployment: "0", //TODO - Change later
                                AlbSubnets: accountConfig.public_subnets.join(","),
                                ContainerName: clusterName,
                                ContainerPort: serviceParams.port_mappings[0].toString(), //TODO - Support all port mappings?
                                DockerImage: imageName,
                                VpcId: accountConfig.vpc,
                                EcsServiceRole: ecsServiceRole.Arn,
                                TaskRole: taskRole.Arn,
                                MaxMb: maxMb.toString(),
                                CpuUnits: cpuUnits.toString(),
                                DeployVersion: serviceContext.deployVersion.toString()
                            };
                            return stackParameters;
                        });
                });
        });
}

function getDependenciesDeployContextMountPoints(dependenciesDeployContexts) {
    let mountPoints = [];
    for (let deployContext of dependenciesDeployContexts) {
        if (deployContext['serviceType'] === 'efs') { //Only EFS is supported as an external service mount point for now
            let envVarKey = deployersCommon.getInjectedEnvVarName(deployContext, 'MOUNT_DIR');

            mountPoints.push({
                mountDir: deployContext.environmentVariables[envVarKey],
                name: envVarKey
            });
        }
    }
    return mountPoints;
}

function getCompiledEcsTemplate(serviceContext, dependenciesDeployContexts) {
    let serviceParams = serviceContext.params;
    let handlebarsParams = {
        portMappings: []
    };

    //Add port mappings
    for (let portToMap of serviceParams['port_mappings']) {
        handlebarsParams.portMappings.push(portToMap);
    }

    //Inject env vars from various sources
    handlebarsParams.environmentVariables = {};

    //Inject env vars defined by service (if any)
    let serviceEnvVars = serviceParams['environment_variables']
    if (serviceEnvVars) {
        handlebarsParams.environmentVariables = _.assign(handlebarsParams.environmentVariables, serviceEnvVars);
    }
    
    //Inject env vars defined by dependencies
    let dependenciesEnvVars = deployersCommon.getEnvVarsFromDependencyDeployContexts(dependenciesDeployContexts);
    handlebarsParams.environmentVariables = _.assign(handlebarsParams.environmentVariables, dependenciesEnvVars);
    
    //Inject env vars from Handel file
    let handelInjectedEnvVars = deployersCommon.getEnvVarsFromServiceContext(serviceContext);
    handlebarsParams.environmentVariables = _.assign(handlebarsParams.environmentVariables, handelInjectedEnvVars);

    //Add volumes and mount points
    let dependenciesMountPoints = getDependenciesDeployContextMountPoints(dependenciesDeployContexts);
    if (Object.keys(dependenciesMountPoints).length > 0) {
        handlebarsParams.volumes = [];
        handlebarsParams.mountPoints = [];

        for (let taskDefMountPoint of dependenciesMountPoints) {
            handlebarsParams.volumes.push({
                sourcePath: taskDefMountPoint.mountDir,
                name: taskDefMountPoint.name
            });

            handlebarsParams.mountPoints.push({
                containerPath: taskDefMountPoint.mountDir,
                sourceVolume: taskDefMountPoint.name
            })
        }
    }

    //Add routing if specified
    let routingInfo = deployersCommon.getRoutingInformationForService(serviceContext);
    if(routingInfo) {
        handlebarsParams.routingInfo = routingInfo;
    }

    //Add the SSH keypair if specified
    if(serviceParams.key_name) {
        handlebarsParams.sshKeyName = serviceParams.key_name
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/ecs-service-template.yml`, handlebarsParams)
}

function createService(stackName, serviceContext, preDeployContext, dependenciesDeployContexts) {
    let clusterName = getShortenedClusterName(serviceContext);
    return getClusterStackParameters(clusterName, serviceContext, preDeployContext, dependenciesDeployContexts)
        .then(stackParameters => {
            return getCompiledEcsTemplate(serviceContext, dependenciesDeployContexts)
                .then(serviceTemplateBody => {
                    return cloudformationCalls.createStack(stackName, serviceTemplateBody, cloudformationCalls.getCfStyleStackParameters(stackParameters));
                });
        });
}

function updateService(stackName, serviceContext, preDeployContext, dependenciesDeployContexts) {
    let clusterName = getShortenedClusterName(serviceContext);
    return getClusterStackParameters(clusterName, serviceContext, preDeployContext, dependenciesDeployContexts)
        .then(stackParameters => {
            return getCompiledEcsTemplate(serviceContext, dependenciesDeployContexts)
                .then(serviceTemplateBody => {
                    return cloudformationCalls.updateStack(stackName, serviceTemplateBody, cloudformationCalls.getCfStyleStackParameters(stackParameters));
                });
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
 * Checks the given service for required parameters and correctness. This provides
 * a fail-fast mechanism for configuration errors before deploy is attempted.
 *
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
 * @returns {Array} - 0 or more String error messages
 */
exports.check = function (serviceContext) {
    let errors = [];
    let params = serviceContext.params;
    if (!params.port_mappings || params.port_mappings.length === 0) {
        errors.push("ECS - 'port_mappings' parameter is required");
    }

    //Check the routing element (if present)
    errors = errors.concat(deployersCommon.checkRoutingElement(serviceContext));

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
    winston.info(`ECS - Executing PreDeploy on ${sgName}`);

    return deployersCommon.createSecurityGroupForService(sgName, true)
        .then(securityGroup => {
            winston.info(`ECS - Finished PreDeploy on ${sgName}`);
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
exports.getPreDeployContextForExternalRef = function(externalRefServiceContext) {
    let sgName = deployersCommon.getResourceName(externalRefServiceContext);
    winston.info(`ECS - Getting PreDeployContext for external reference ${sgName}`);

    return ec2Calls.getSecurityGroup(sgName, accountConfig.vpc)
        .then(securityGroup => {
            if(securityGroup) {
                let externalPreDeployContext = new PreDeployContext(externalRefServiceContext);
                externalPreDeployContext.securityGroups.push(securityGroup);
                return externalPreDeployContext;
            }
            throw new Error(`ECS - Resources from PreDeploy not found!`); 
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
    winston.info(`ECS - Bind not required for this service, skipping it`);
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
exports.getBindContextForExternalRef = function(externalRefServiceContext, externalRefPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`DynamoDB - Getting BindContext for external service`);
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
    winston.info(`ECS - Deploying Cluster and Service ${stackName}`);

    return cloudformationCalls.getStack(stackName)
        .then(serviceStack => {
            if (!serviceStack) { //Create 
                winston.info(`ECS - Creating new ECS cluster ${stackName}`);
                return createService(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts);
            }
            else { //Update
                //TODO - If user data changed, then cycle all instances in a safe manner (https://github.com/colinbjohnson/aws-missing-tools/blob/master/aws-ha-release/aws-ha-release.sh)
                winston.info(`ECS - Updating existing ECS cluster ${stackName}`);
                return updateService(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts);
            }
        })
        .then(serviceStack => {
            winston.info(`ECS - Finished Deploying Cluster and Serivce ${stackName}`);
            let deployContext = new DeployContext(ownServiceContext);
            return deployContext;
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
exports.getDeployContextForExternalRef = function(externalRefServiceContext) {
    winston.info(`ECS - Getting DeployContext for external reference`);
    let externalRefStackName = deployersCommon.getResourceName(externalRefServiceContext);
    return cloudformationCalls.getStack(externalRefStackName)
        .then(externalStack => {
            if(externalStack) {
                return new DeployContext(externalRefServiceContext);
            }
            throw new Error(`ECS - Stack ${externalRefStackName} is not deployed!`);
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
    return Promise.reject(new Error("The ECS service doesn't consume events from other services"));
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
exports.getConsumeEventsContextForExternalRef = function(ownServiceContext, ownDeployContext, externalRefServiceContext, externalRefDeployContext) {
    return Promise.reject(new Error("The ECS service doesn't consume events from other services"));
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
    return Promise.reject(new Error("The ECS service doesn't produce events for other services"));
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
    'securityGroups'
];