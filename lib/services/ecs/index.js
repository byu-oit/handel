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

function createService(clusterName, taskDefinitionArn, serviceContext, preDeployContext, dependenciesDeployContexts) {
    return getClusterStackParameters(clusterName, taskDefinitionArn, serviceContext, preDeployContext, dependenciesDeployContexts)
        .then(stackParameters => {
            let clusterTemplateBody = util.readFileSync(`${__dirname}/ecs-service.yml`);
            return cloudformationCalls.createStack(clusterName, clusterTemplateBody, cloudformationCalls.getCfStyleStackParameters(stackParameters));
        });
}

function updateService(clusterName, taskDefinitionArn, serviceContext, preDeployContext, dependenciesDeployContexts) {
    return getClusterStackParameters(clusterName, taskDefinitionArn, serviceContext, preDeployContext, dependenciesDeployContexts)
        .then(stackParameters => {
            let clusterTemplateBody = util.readFileSync(`${__dirname}/ecs-service.yml`);
            return cloudformationCalls.updateStack(clusterName, clusterTemplateBody, cloudformationCalls.getCfStyleStackParameters(stackParameters));
        });
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
    let sg_name = `${serviceContext.appName}-${serviceContext.environmentName}-${serviceContext.serviceName}-${serviceContext.serviceType}`;
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
            let preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push(securityGroup);
            return preDeployContext;
        });
}

//Don't use this to create resources
exports.bind = function(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    return Promise.resolve(new BindContext(ownServiceContext));
}

/**
 * Deploy the instance of the service based on the service params passed in.
 */
exports.deploy = function(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let clusterName = `${ownServiceContext.appName}-${ownServiceContext.environmentName}-${ownServiceContext.serviceName}`;
    let deployContext = new DeployContext(ownServiceContext);

    return deployersCommon.createCustomRoleForService(ownServiceContext, dependenciesDeployContexts)
        .then(role => {
            let taskDefinition = taskDefTemplate.getTaskDefinition(ownServiceContext, role.Arn, dependenciesDeployContexts);
            return ecsCalls.registerTaskDefinition(taskDefinition)
        })
        .then(taskDefinition => {
            return cloudformationCalls.getStack(clusterName)
                .then(serviceStack => {
                    if(!serviceStack) { //Create 
                        winston.info(`Creating new ECS cluster ${clusterName}`);
                        return createService(clusterName, taskDefinition.taskDefinitionArn, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts);
                    }
                    else { //Update
                        //TODO - If user data changed, then cycle all instances in a safe manner (https://github.com/colinbjohnson/aws-missing-tools/blob/master/aws-ha-release/aws-ha-release.sh)

                        winston.info(`Updating existing ECS cluster ${clusterName}`);
                        return updateService(clusterName, taskDefinition.taskDefinitionArn, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts);
                    }
                })
                .then(serviceStack => {
                    return deployContext;
                });
        });
}