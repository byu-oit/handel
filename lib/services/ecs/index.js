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
    let maxInstanceMemoryToUse = instanceMemory * .7; //Fill up instances to 70% of capacity

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

function getHttpsCertificate(serviceContext) {
    let serviceParams = serviceContext.params;

    if (serviceParams.https_certificate) {
        return serviceParams.https_certificate;
    }
    return null; //No HTTPS specified, will use HTTP.
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
            return deployersCommon.createCustomRoleForService("ecs-tasks.amazonaws.com", null, serviceContext, dependenciesDeployContexts)
                .then(taskRole => {
                    return createEcsServiceRoleIfNotExists()
                        .then(ecsServiceRole => {
                            let serviceParams = serviceContext.params;
                            let minContainers = serviceParams.min_containers || 1;
                            let maxContainers = serviceParams.max_containers || 1;
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
                                KeyName: serviceParams.key_name,
                                EcsSecurityGroup: preDeployContext.securityGroups[0].GroupId,
                                AmiImageId: accountConfig.ecs_ami,
                                UserData: new Buffer(userDataScript).toString('base64'),
                                AsgSubnetIds: accountConfig.private_subnets.join(","),
                                AsgCooldown: "300",
                                DesiredCount: "2", //TODO - Change later to use real value
                                MinimumHealthyPercentDeployment: "50", //TODO - Change later to use real value
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

    //Inject env vars
    let serviceEnvVars = serviceParams['environment_variables']
    let dependenciesEnvVars = deployersCommon.getEnvVarsFromDependencyDeployContexts(dependenciesDeployContexts);
    if (serviceEnvVars || Object.keys(dependenciesEnvVars).length > 0) {
        handlebarsParams.environmentVariables = {};

        //Inject env vars defined by service
        if (serviceEnvVars) {
            for (let envVarName in serviceEnvVars) {
                handlebarsParams.environmentVariables[envVarName] = serviceEnvVars[envVarName];
            }
        }
        //Inject env vars defined by dependencies
        for (let envVarName in dependenciesEnvVars) {
            handlebarsParams.environmentVariables[envVarName] = dependenciesEnvVars[envVarName];
        }
    }

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

    //Determine whether to use HTTP or HTTPS
    let httpsCertificate = getHttpsCertificate(serviceContext);
    if (httpsCertificate) {
        handlebarsParams.certificateArn = `arn:aws:acm:us-west-2:${accountConfig.account_id}:certificate/${httpsCertificate}`;
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
 * Checks the service parameters for the deployable service in order to provide a 
 * fail-fast mechanism 
 */
exports.check = function (serviceContext) {
    let errors = [];
    let params = serviceContext.params;
    if (!params.port_mappings || params.port_mappings.length === 0) {
        errors.push("ECS - 'port_mappings' parameter is required");
    }

    //Require either an HTTPS cert of explicit confirmation of HTTP-only
    if (!params.https_certificate && params.http_only !== true) {
        errors.push("ECS - You must either specify an HTTPS certificate in 'https_certificate' or explicitly specify HTTP-only ALB by setting 'http_only' to 'true'");
    }

    return errors;
}

/**
 * 
 */
exports.preDeploy = function (serviceContext) {
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
exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`ECS - Bind not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext));
}

/**
 * Deploy the instance of the service based on the service params passed in.
 */
exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`ECS - Deploying Cluster and Service ${stackName}`);
    let deployContext = new DeployContext(ownServiceContext);


    return cloudformationCalls.getStack(stackName)
        .then(serviceStack => {
            if (!serviceStack) { //Create 
                winston.info(`Creating new ECS cluster ${stackName}`);
                return createService(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts);
            }
            else { //Update
                //TODO - If user data changed, then cycle all instances in a safe manner (https://github.com/colinbjohnson/aws-missing-tools/blob/master/aws-ha-release/aws-ha-release.sh)
                winston.info(`Updating existing ECS cluster ${stackName}`);
                return updateService(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts);
            }
        })
        .then(serviceStack => {
            winston.info(`ECS - Finished Deploying Cluster and Serivce ${stackName}`);
            return deployContext;
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