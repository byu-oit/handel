const winston = require('winston');
const ec2Calls = require('../../aws/ec2-calls');
const handlebarsUtils = require('../../util/handlebars-utils');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../util/account-config')().getAccountConfig();
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployersCommon = require('../deployers-common');
const util = require('../../util/util');

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

    let mountDir = `/mnt/share/${fileSystemName}`
    return getMountScript(fileSystemId, region, mountDir)
        .then(mountScript => {
            let mountDirEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'MOUNT_DIR');
            deployContext.environmentVariables[mountDirEnv] = mountDir
            deployContext.scripts.push(mountScript);
            return deployContext;
        });
}

function getFileSystemIdFromStack(stack) {
    let fileSystemId = cloudFormationCalls.getOutput('EFSFileSystemId', stack);
    if(fileSystemId) {
        return fileSystemId;
    }
    else {
        throw new Error("Couldn't find EFS file system ID in CloudFormation stack outputs");
    }
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
    let perfModeParam = params['performance_mode']
    if(perfModeParam) {
        if(perfModeParam !== 'general_purpose' && perfModeParam !== 'max_io') {
            errors.push("EFS - 'performance_mode' parameter must be either 'general_purpose' or 'max_io'");
        }
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
    let sg_name = `${serviceContext.appName}-${serviceContext.environmentName}-${serviceContext.serviceName}-${serviceContext.serviceType}`;
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

    let stackName = `${ownServiceContext.appName}-${ownServiceContext.environmentName}-${ownServiceContext.serviceName}`;

    return cloudFormationCalls.getStack(stackName)
        .then(stack => {
            if(!stack) {
                winston.info(`Creating EFS file system ${stackName}`);
                let efsParams = ownServiceContext.params;

                //Choose performance mode
                let performanceMode = "generalPurpose"; //Default
                if(efsParams.performance_mode) {
                    performanceMode = EFS_PERFORMANCE_MODE_MAP[efsParams.performance_mode];
                }

                //Set up subnets
                let subnetIds = accountConfig['data_subnets'];
                let subnetA = subnetIds[0]; //Default to using a single subnet for the ids (if they only provided one)
                let subnetB = subnetIds[0];
                if(subnetIds.length > 1) { //Use multiple subnets if provided
                    subnetB = subnetIds[1]; 
                }

                //Specify parameters to be passed into stack
                let stackParameters = {
                    FileSystemName: stackName,
                    PerformanceMode: performanceMode,
                    SecurityGroup: ownPreDeployContext['securityGroups'][0].GroupId, //Only one created for this file system
                    SubnetA: subnetA,
                    SubnetB: subnetB
                };
                let efsTemplate = util.readFileSync(`${__dirname}/efs.yml`);

                return cloudFormationCalls.createStack(stackName, efsTemplate, cloudFormationCalls.getCfStyleStackParameters(stackParameters))
                    .then(createdStack => {
                        let fileSystemId = getFileSystemIdFromStack(createdStack);
                        return getDeployContext(ownServiceContext, fileSystemId, accountConfig['region'], stackName);
                    });
            }
            else {
                winston.info(`Updates are not supported for the EFS service`);
                let fileSystemId = getFileSystemIdFromStack(stack);
                return getDeployContext(ownServiceContext, fileSystemId, accountConfig['region'], stackName);
            }
        });
}