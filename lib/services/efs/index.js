const winston = require('winston');
const ec2Calls = require('../../aws/ec2-calls');
const efsCalls = require('../../aws/efs-calls');
const handlebarsUtils = require('../../util/handlebars-utils');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../util/account-config')().getAccountConfig();
const EFS_PORT = 2049;
const EFS_SG_PROTOCOL = "tcp";
const EFS_PERFORMANCE_MODE_MAP = {
    "general_purpose": "generalPurpose",
    "max_io": "maxIO"
}

function getMountScript(fileSystemId, region, mountDir) {
    let variables = { //TODO - REPLACE THIS WITH SOMETHING ELSE
        "EFS_FILE_SYSTEM_ID": fileSystemId,
        "EFS_REGION": region,
        "EFS_MOUNT_DIR": mountDir
    }
    return handlebarsUtils.compileTemplate(`${__dirname}/mount-script-template.sh`, variables)
        .then(mountScript => {
            return mountScript;
        });
}

function getDeployContext(serviceContext, fileSystemId, region, fileSystemName) {
    let deployContext = new DeployContext(serviceContext);
    let envVarKeyPrefix = `EFS_${serviceContext.appName.toUpperCase()}_${serviceContext.environmentName.toUpperCase()}_${serviceContext.serviceName.toUpperCase()}`

    let mountDir = `/mnt/share/${fileSystemName}`
    return getMountScript(fileSystemId, region, mountDir)
        .then(mountScript => {
            deployContext.outputs[`${envVarKeyPrefix}_MOUNT_DIR`] = mountDir
            deployContext.scripts.push(mountScript);
            return deployContext;
        });
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
            let preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push(securityGroup);
            return preDeployContext;
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
            return new BindContext(ownServiceContext);
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
                    .then(createdFileSystem => {
                        return getDeployContext(ownServiceContext, createdFileSystem['FileSystemId'], accountConfig['region'], fileSystemName);
                    });
            }
            else {
                winston.info(`Updates are not supported for the EFS service`);
                return getDeployContext(ownServiceContext, fileSystem['FileSystemId'], accountConfig['region'], fileSystemName);
            }
        });
}