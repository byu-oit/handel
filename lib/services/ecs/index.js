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
const DeployContext = require('../../datatypes/deploy-context');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
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

function getInstanceCountForCluster(instanceType, containerInstances, containerMaxMemory) {
    let instanceMemory = EC2_INSTANCE_MEMORY_MAP[instanceType];
    if (!instanceMemory) {
        throw new Error(`${SERVICE_NAME} - Unhandled instance type specified: ${instanceType}`);
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

function getCompiledEcsTemplate(stackName, clusterName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, userDataScript, ecsServiceRole) {
    let serviceParams = ownServiceContext.params;

    let taskRoleStatements = getTaskRoleStatements(ownServiceContext, dependenciesDeployContexts);

    let minContainers = serviceParams.min_containers || 1;
    let maxContainers = serviceParams.max_containers || 1;
    let instanceType = serviceParams.instance_type || "t2.micro";
    let maxMb = serviceParams.max_mb || 128;
    let minInstances = getInstanceCountForCluster(instanceType, minContainers, maxMb);
    let maxInstances = getInstanceCountForCluster(instanceType, maxContainers, maxMb);
    let imageName = `${accountConfig.account_id}.dkr.ecr.${accountConfig.region}.amazonaws.com/${ownServiceContext.appName}-${ownServiceContext.serviceName}:${ownServiceContext.environmentName}`
    let cpuUnits = serviceParams.cpu_units || 100;

    let handlebarsParams = {
        portMappings: [],
        clusterName,
        stackName,
        minContainers,
        maxContainers,
        instanceType,
        minInstances: minInstances.toString(),
        maxInstances: maxInstances.toString(),
        ecsSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId,
        amiImageId: accountConfig.ecs_ami,
        userData: new Buffer(userDataScript).toString('base64'),
        privateSubnetIds: accountConfig.private_subnets,
        asgCooldown: "300",
        desiredCount: minContainers.toString(),
        minimumHealthyPercentDeployment: "0", //TODO - Change later
        publicSubnetIds: accountConfig.public_subnets,
        containerName: clusterName,
        dockerImage: imageName,
        vpcId: accountConfig.vpc,
        ecsServiceRoleArn: ecsServiceRole.Arn,
        policyStatements: taskRoleStatements,
        maxMb: maxMb.toString(),
        cpuUnits: cpuUnits.toString(),
        deployVersion: ownServiceContext.deployVersion.toString()
    };

    //Add port mappings if routing is specified
    if (serviceParams.routing) {
        //Wire up first port to Load Balancer
        handlebarsParams.containerPort = serviceParams.port_mappings[0].toString();

        //Add port mappings to container
        for (let portToMap of serviceParams['port_mappings']) {
            handlebarsParams.portMappings.push(portToMap);
        }
    }

    //Inject env vars from various sources
    handlebarsParams.environmentVariables = {};

    //Inject env vars defined by service (if any)
    let serviceEnvVars = serviceParams['environment_variables']
    if (serviceEnvVars) {
        handlebarsParams.environmentVariables = _.assign(handlebarsParams.environmentVariables, serviceEnvVars);
    }

    //Inject env vars defined by dependencies
    let dependenciesEnvVars = deployPhaseCommon.getEnvVarsFromDependencyDeployContexts(dependenciesDeployContexts);
    handlebarsParams.environmentVariables = _.assign(handlebarsParams.environmentVariables, dependenciesEnvVars);

    //Inject env vars from Handel file
    let handelInjectedEnvVars = deployPhaseCommon.getEnvVarsFromServiceContext(ownServiceContext);
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
    let routingInfo = getRoutingInformationForService(ownServiceContext);
    if (routingInfo) {
        handlebarsParams.routingInfo = routingInfo;
    }

    //Add the SSH keypair if specified
    if (serviceParams.key_name) {
        handlebarsParams.sshKeyName = serviceParams.key_name
    }

    //Add tags (if specified)
    if (serviceParams.tags) {
        handlebarsParams.tags = serviceParams.tags
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/ecs-service-template.yml`, handlebarsParams)
}

/**
 * This function creates a short resource name for the cluster. We don't use the standard cf stack name here because the max length
 *   of an ALB Target Group is 32 characters
 */
function getShortenedClusterName(serviceContext) {
    return `${serviceContext.appName.substring(0, 21)}-${serviceContext.environmentName.substring(0, 4)}-${serviceContext.serviceName.substring(0, 9)}`;
}

function checkRoutingElement(serviceContext) {
    let errors = [];
    let serviceParams = serviceContext.params;
    if (serviceParams.routing) {
        if (!serviceParams.routing.type) {
            errors.push(`${serviceContext.serviceType} - The 'type' field is required in the 'routing' section`);
        }
        else {
            if (serviceParams.routing.type === 'https' && !serviceParams.routing.https_certificate) {
                errors.push(`${serviceContext.serviceType} - The 'https_certificate' element is required when you are using 'https' as the routing type`);
            }
        }
    }
    return errors;
}

function getRoutingInformationForService(serviceContext) {
    let serviceParams = serviceContext.params;
    if (serviceParams.routing) {
        let routingInfo = {
            type: serviceParams.routing.type,
            timeout: 60,
            healthCheckPath: '/'
        };
        if (serviceParams.routing.timeout) {
            routingInfo.timeout = serviceParams.routing.timeout;
        }
        if (serviceParams.routing.health_check_path) {
            routingInfo.healthCheckPath = serviceParams.routing.health_check_path;
        }
        if (routingInfo.type === 'https') {
            routingInfo.httpsCertificate = `arn:aws:acm:us-west-2:${accountConfig.account_id}:certificate/${serviceParams.routing.https_certificate}`;
        }
        return routingInfo;
    }
    return null; //No routing specified
}


/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext) {
    let errors = [];
    let params = serviceContext.params;
    if (params.routing) {
        if (!params.port_mappings || params.port_mappings.length === 0) {
            errors.push("${SERVICE_NAME} - 'port_mappings' parameter is required when you specify the 'routing' element");
        }
    }

    //Check the routing element (if present)
    errors = errors.concat(checkRoutingElement(serviceContext));

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
    return getUserDataScript(clusterName, dependenciesDeployContexts)
        .then(userDataScript => {
            return createEcsServiceRoleIfNotExists()
                .then(ecsServiceRole => {
                    return getCompiledEcsTemplate(stackName, clusterName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, userDataScript, ecsServiceRole)
                });
        })
        .then(compiledTemplate => {
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME);
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