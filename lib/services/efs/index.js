const winston = require('winston');
const ec2Calls = require('../../aws/ec2-calls');
const efsCalls = require('../../aws/efs-calls');
const accountConfig = require('../../util/config')().getAccountConfig();
const EFS_PORT = 2049;
const EFS_SG_PROTOCOL = "tcp";
const EFS_PERFORMANCE_MODE_MAP = {
    "general_purpose": "generalPurpose",
    "max_io": "maxIO"
}


/**
 * Checks the given service for required parameters and correctness. This provides
 * a fail-fast mechanism for configuration errors before deploy is attempted.
 *
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
 * @returns {Array} - 0 or more String error messages
 */
exports.check = function(serviceContext) {
    let errors = [];
    let params = serviceContext.params;
    if(!params['performance_mode']) {
        errors.push("EFS - 'performance_mode' parameter is required");
    }
    return errors;
}


/**
 * Create resources needed for deployment that are also needed for dependency wiring
 * with other services
 *
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
 * @returns {Promise.<PreDeployContext>} - A Promise of the PreDeployContext results from the pre-deploy
 */
exports.preDeploy = function(serviceContext) {
    let sg_name = `${serviceContext.appName}_${serviceContext.environmentName}_${serviceContext.serviceName}_${serviceContext.serviceType}`;
    return ec2Calls.createSecurityGroupIfNotExists(sg_name, accountConfig['vpc'])
        .then(securityGroup => {
            return {
                serviceName: serviceContext.serviceName,
                serviceType: serviceContext.serviceType,
                securityGroups: [ securityGroup ]
            }
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
exports.bind = function(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    let ownSg = ownPreDeployContext.securityGroups[0];
    let sourceSg = dependentOfPreDeployContext.securityGroups[0];
    
    return ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, ownSg, 
                                                  EFS_SG_PROTOCOL, EFS_PORT, 
                                                  EFS_PORT, accountConfig['vpc'])
        .then(efsSecurityGroup => {
            return {
                serviceName: ownServiceContext.serviceName,
                serviceType: ownServiceContext.serviceType,
                securityGroups: [efsSecurityGroup]
            }
        });
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
exports.deploy = function(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let fileSystemName = `${ownServiceContext.appName}_${ownServiceContext.environmentName}_${ownServiceContext.serviceName}`;
    return efsCalls.getFileSystem(fileSystemName)
        .then(fileSystem => {
            if(!fileSystem) {
                winston.info(`Creating EFS file system ${fileSystemName}`);
                let efsParams = ownServiceContext.params;
                let performanceMode = EFS_PERFORMANCE_MODE_MAP[efsParams['performance_mode']];
                let subnetIds = accountConfig['data_subnets'];
                let securityGroup = ownPreDeployContext['securityGroups'][0]; //Only one created for this file system

                return efsCalls.createFileSystem(fileSystemName, performanceMode, subnetIds, securityGroup)
                    .then(result => {
                        console.log(result); //TODO REMOVE LATER
                        return result;
                        //Return deploy context
                    });
            }
            else {
                winston.info("Updates not supported for EFS");
                return fileSystem;
                //Return deploy context
            }
        });
}