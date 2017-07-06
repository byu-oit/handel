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
const ec2Calls = require('../../aws/ec2-calls');
const DeployContext = require('../../datatypes/deploy-context');
const cloudformationCalls = require('../../aws/cloudformation-calls');
const accountConfig = require('../../common/account-config')().getAccountConfig();
const deployPhaseCommon = require('../../common/deploy-phase-common');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../common/bind-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const handlebarsUtils = require('../../common/handlebars-utils');
const _ = require('lodash');

const SERVICE_NAME = "ECS";

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

function getInstanceCountForCluster(instanceType, autoScaling, containerConfigs, calculationType) {
    let instanceMemory = EC2_INSTANCE_MEMORY_MAP[instanceType];
    if (!instanceMemory) {
        throw new Error(`${SERVICE_NAME} - Unhandled instance type specified: ${instanceType}`);
    }
    let maxInstanceMemoryToUse = instanceMemory * .9; //Fill up instances to 90% of capacity

    // Calculate the total number of tasks to fit
    let tasksCount = null;
    if (calculationType === 'max') { //Calculate max containers
        tasksCount = autoScaling.maxTasks;
    }
    else { //Calculate min containers
        tasksCount = autoScaling.minTasks;
    }

    // Calculate the total size of a single task
    let totalTaskMb = 0;
    for (let containerConfig of containerConfigs) {
        totalTaskMb += containerConfig.maxMb;
    }

    // Calculate the number of instances needed to fit the number of tasks
    let numInstances = 1; //Need at least one instance
    let currentInstanceMem = 0;
    for (let i = 0; i < tasksCount; i++) {
        if ((currentInstanceMem + totalTaskMb) > maxInstanceMemoryToUse) {
            numInstances += 1;
            currentInstanceMem = 0;
        }
        currentInstanceMem += totalTaskMb;
    }

    //When calculating maxInstances, multiple maxContainers by two so that we can temporarily have more instances during deployments if necessary
    if (calculationType === 'max') {
        numInstances *= 2;
    }

    return numInstances;
}

function createAutoScalingLambdaIfNotExists() {
    let stackName = 'HandelEcsAutoScalingLambda';
    return cloudformationCalls.getStack(stackName)
        .then(stack => {
            if (!stack) {
                return deployPhaseCommon.uploadDirectoryToHandelBucket(`${__dirname}/cluster-scaling-lambda/`, 'handel/ecs-cluster-auto-scaling-lambda', 'lambda-code')
                    .then(s3ObjectInfo => {
                        let handlebarsParams = {
                            s3Bucket: s3ObjectInfo.Bucket,
                            s3Key: s3ObjectInfo.Key
                        }
                        return handlebarsUtils.compileTemplate(`${__dirname}/cluster-scaling-lambda/scaling-lambda-template.yml`, handlebarsParams)
                            .then(compiledTemplate => {
                                winston.info(`Creating Lambda for ECS auto-scaling`);
                                return cloudformationCalls.createStack(stackName, compiledTemplate, [], null);
                            });
                    });
            }
            else {
                return stack;
            }
        });
}


function getRoutingInformationForContainer(container, albPriority) {
    let routingInfo = {
        healthCheckPath: '/',
        basePath: '/',
        albPriority
    };
    if (container.routing.health_check_path) {
        routingInfo.healthCheckPath = container.routing.health_check_path;
    }
    if (container.routing.base_path) {
        routingInfo.basePath = container.routing.base_path;
    }

    //Wire up first port to Load Balancer
    routingInfo.containerPort = container.port_mappings[0].toString();

    return routingInfo;
}

function getLoadBalancerConfig(serviceParams, defaultRouteContainer) {
    let loadBalancerConfig = { //Default values for load balancer
        timeout: 60,
        type: 'http',
        defaultRouteContainer
    }

    let loadBalancer = serviceParams.load_balancer;
    if (loadBalancer) {
        if (loadBalancer.timeout) {
            loadBalancerConfig.timeout = loadBalancer.timeout;
        }
        if (loadBalancer.type) {
            loadBalancerConfig.type = loadBalancer.type;
        }
        if (loadBalancer.https_certificate) {
            loadBalancerConfig.httpsCertificate = `arn:aws:acm:us-west-2:${accountConfig.account_id}:certificate/${loadBalancer.https_certificate}`;
        }
    }

    return loadBalancerConfig;
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
    let trustedService = 'ecs.amazonaws.com';
    let policyStatementsToConsume = [
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
            "Resource": [
                "*"
            ]
        }
    ]

    return deployPhaseCommon.createCustomRole(trustedService, roleName, policyStatementsToConsume)
        .then(role => {
            return role;
        });
}

function getDependenciesDeployContextMountPoints(dependenciesDeployContexts) {
    let mountPoints = [];
    for (let deployContext of dependenciesDeployContexts) {
        if (deployContext['serviceType'] === 'efs') { //Only EFS is supported as an external service mount point for now
            let envVarKey = deployPhaseCommon.getInjectedEnvVarName(deployContext, 'MOUNT_DIR');

            mountPoints.push({
                mountDir: deployContext.environmentVariables[envVarKey],
                name: envVarKey
            });
        }
    }
    return mountPoints;
}

function getTaskRoleStatements(serviceContext, dependenciesDeployContexts) {
    let ownPolicyStatements = deployPhaseCommon.getAppSecretsAccessPolicyStatements(serviceContext);

    return deployPhaseCommon.getAllPolicyStatementsForServiceRole(ownPolicyStatements, dependenciesDeployContexts);
}

function getLatestEcsAmiId() {
    return ec2Calls.getLatestAmiByName('amazon', 'amazon-ecs')
}

function getEnvironmentVariablesForContainer(container, ownServiceContext, dependenciesDeployContexts) {
    let environmentVariables = {};

    //Inject env vars defined by service (if any)
    if (container.environment_variables) {
        environmentVariables = _.assign(environmentVariables, container.environment_variables);
    }

    //Inject env vars defined by dependencies
    let dependenciesEnvVars = deployPhaseCommon.getEnvVarsFromDependencyDeployContexts(dependenciesDeployContexts);
    environmentVariables = _.assign(environmentVariables, dependenciesEnvVars);

    //Inject env vars from Handel file
    let handelInjectedEnvVars = deployPhaseCommon.getEnvVarsFromServiceContext(ownServiceContext);
    environmentVariables = _.assign(environmentVariables, handelInjectedEnvVars);

    return environmentVariables;
}

function getVolumes(dependenciesDeployContexts) {
    let volumes = null;
    let dependenciesMountPoints = getDependenciesDeployContextMountPoints(dependenciesDeployContexts);
    if (Object.keys(dependenciesMountPoints).length > 0) {
        volumes = [];

        for (let taskDefMountPoint of dependenciesMountPoints) {
            volumes.push({
                sourcePath: taskDefMountPoint.mountDir,
                name: taskDefMountPoint.name
            });
        }
    }
    return volumes;
}

function getMountPointsForContainer(dependenciesDeployContexts) {
    let mountPoints = null;
    let dependenciesMountPoints = getDependenciesDeployContextMountPoints(dependenciesDeployContexts);
    if (Object.keys(dependenciesMountPoints).length > 0) {
        mountPoints = [];

        for (let taskDefMountPoint of dependenciesMountPoints) {
            mountPoints.push({
                containerPath: taskDefMountPoint.mountDir,
                sourceVolume: taskDefMountPoint.name
            });
        }
    }
    return mountPoints;
}


function getCompiledEcsTemplate(stackName, clusterName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, userDataScript, ecsServiceRole) {
    return getLatestEcsAmiId()
        .then(latestEcsAmi => {
            let serviceParams = ownServiceContext.params;
            let instanceType = "t2.micro";
            if(serviceParams.cluster && serviceParams.cluster.instance_type) {
                instanceType = serviceParams.cluster.instance_type;
            }

            //Configure auto-scaling
            //TODO - More work on configuring auto-scaling
            let autoScaling = {};
            autoScaling.minTasks = serviceParams.auto_scaling.min_tasks;
            autoScaling.maxTasks = serviceParams.auto_scaling.max_tasks;

            let oneOrMoreTasksHasRouting = false;
            let defaultRouteContainer = null;

            let containerConfigs = [];
            let albPriority = 1;
            for (let container of serviceParams.containers) {
                let containerConfig = {};

                containerConfig.name = container.name;
                containerConfig.maxMb = container.max_mb || 128;
                containerConfig.cpuUnits = container.cpu_units || 100;

                //Inject environment variables into the container
                containerConfig.environmentVariables = getEnvironmentVariablesForContainer(container, ownServiceContext, dependenciesDeployContexts);

                //Add port mappings if routing is specified
                if (container.routing) {
                    oneOrMoreTasksHasRouting = true;

                    containerConfig.routingInfo = getRoutingInformationForContainer(container, albPriority);
                    albPriority += 1;

                    //Add other port mappings to container
                    containerConfig.portMappings = [];
                    for (let portToMap of container.port_mappings) {
                        containerConfig.portMappings.push(portToMap);
                    }

                    if (!defaultRouteContainer) {
                        defaultRouteContainer = containerConfig;
                    }
                }

                //Configure image name
                //TODO - ALLOW SPECIFYING CUSTOM IMAGE NAMES OTHER THAN DEFAULT
                containerConfig.imageName = `${accountConfig.account_id}.dkr.ecr.${accountConfig.region}.amazonaws.com/${ownServiceContext.appName}-${ownServiceContext.serviceName}-${container.name}:${ownServiceContext.environmentName}`

                //Add mount points if present
                containerConfig.mountPoints = getMountPointsForContainer(dependenciesDeployContexts);

                containerConfigs.push(containerConfig);
            }

            let handlebarsParams = {
                clusterName,
                stackName,
                instanceType,
                minInstances: getInstanceCountForCluster(instanceType, autoScaling, containerConfigs, 'min'),
                maxInstances: getInstanceCountForCluster(instanceType, autoScaling, containerConfigs, 'max'),
                ecsSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId,
                amiImageId: latestEcsAmi.ImageId,
                userData: new Buffer(userDataScript).toString('base64'),
                privateSubnetIds: accountConfig.private_subnets,
                publicSubnetIds: accountConfig.public_subnets,
                asgCooldown: "300",
                minimumHealthyPercentDeployment: "50", //TODO - Do we need to support more than just 50?
                vpcId: accountConfig.vpc,
                ecsServiceRoleArn: ecsServiceRole.Arn,
                policyStatements: getTaskRoleStatements(ownServiceContext, dependenciesDeployContexts),
                deployVersion: ownServiceContext.deployVersion.toString(),
                tags: deployPhaseCommon.getTags(ownServiceContext),
                containerConfigs,
                autoScaling,
                oneOrMoreTasksHasRouting
            };

            if (oneOrMoreTasksHasRouting) {
                handlebarsParams.loadBalancer = getLoadBalancerConfig(serviceParams, defaultRouteContainer);
            }

            //Add the SSH keypair if specified
            if (serviceParams.cluster && serviceParams.cluster.key_name) {
                handlebarsParams.sshKeyName = serviceParams.cluster.key_name
            }

            //Add volumes if present (these are consumed by one or more container mount points)
            handlebarsParams.volumes = getVolumes(dependenciesDeployContexts);

            return handlebarsUtils.compileTemplate(`${__dirname}/ecs-service-template.yml`, handlebarsParams)
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
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */
exports.check = function (serviceContext) {
    let errors = [];
    let params = serviceContext.params;

    if(!params.auto_scaling) {
        errors.push(`${SERVICE_NAME} - The 'auto_scaling' section is required`);
    }
    else {
        if(!params.auto_scaling.min_tasks) {
            errors.push(`${SERVICE_NAME} - The 'min_tasks' parameter is required in the 'auto_scaling' section`);
        }
        if(!params.auto_scaling.max_tasks) {
            errors.push(`${SERVICE_NAME} - The 'max_tasks' parameter is required in the 'auto_scaling' section`);
        }
    }

    if(params.load_balancer) {
        //Require the load balancer listener type
        if(!params.load_balancer.type) {
            errors.push(`${SERVICE_NAME} - The 'type' parameter is required in the 'load_balancer' section`);
        }

        //If type = https, require https_certificate
        if(params.load_balancer.type === 'https' && !params.load_balancer.https_certificate) {
            errors.push(`${SERVICE_NAME} - The 'https_certificate' parameter is required in the 'load_balancer' section when you use HTTPS`);
        }
    }

    //Require at least one container definition
    if(!params.containers || params.containers.length === 0) {
        errors.push(`${SERVICE_NAME} - You must specify at least one container in the 'containers' section`);
    }
    else {
        let alreadyHasOneRouting = false;
        for(let container of params.containers) {
            //Require 'name'
            if(!container.name) {
                errors.push(`${SERVICE_NAME} - The 'name' parameter is required in each container in the 'containers' section`);
            }

            if(container.routing) {
                //Only allow one 'routing' section currently
                if(alreadyHasOneRouting) {
                    errors.push(`${SERVICE_NAME} - You may not specify a 'routing' section in more than one container. This is due to a current limitation in ECS load balancing`);
                }
                else {
                    alreadyHasOneRouting = true;
                }

                //Require port_mappings if routing is specified
                if(!container.port_mappings) {
                    errors.push(`${SERVICE_NAME} - The 'port_mappings' parameter is required when you specify the 'routing' element`);
                }
            }
        }
    }

    return errors;
}

exports.preDeploy = function (serviceContext) {
    return preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, 22, SERVICE_NAME);
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    return bindPhaseCommon.bindNotRequired(ownServiceContext, dependentOfServiceContext, SERVICE_NAME);
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying Cluster and Service ${stackName}`);

    let clusterName = getShortenedClusterName(ownServiceContext);
    return createAutoScalingLambdaIfNotExists()
        .then(autoScalingLambda => {
            return getUserDataScript(clusterName, dependenciesDeployContexts)
        })
        .then(userDataScript => {
            return createEcsServiceRoleIfNotExists()
                .then(ecsServiceRole => {
                    return getCompiledEcsTemplate(stackName, clusterName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, userDataScript, ecsServiceRole)
                });
        })
        .then(compiledTemplate => {
            let stackTags = deployPhaseCommon.getTags(ownServiceContext)
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME, stackTags);
        })
        .then(deployedStack => {
            winston.info(`${SERVICE_NAME} - Finished Deploying Cluster and Serivce ${stackName}`);
            let deployContext = new DeployContext(ownServiceContext);
            return deployContext;
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't consume events from other services`));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't produce events for other services`));
}

exports.unPreDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

exports.unBind = function (ownServiceContext) {
    return deletePhasesCommon.unBindNotRequired(ownServiceContext, SERVICE_NAME);
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
    'securityGroups'
];