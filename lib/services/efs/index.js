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
    let sgName = deployersCommon.getResourceName(serviceContext);
    winston.info(`EFS - Executing PreDeploy on ${sgName}`);

    return deployersCommon.createSecurityGroupForService(sgName, false)
        .then(securityGroup => {
            winston.info(`EFS - Finished PreDeploy on ${sgName}`);
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
 * If PreDeploy has not been run yet for this service, this function should return an error. 
 * 
 * @param {ServiceContext} externalRefServiceContext - The ServiceContext of the external reference for which to get its PreDeployContext
 * @returns {Promise.<PreDeployContext>} - A Promise of the PreDeployContext results from the PreDeploy phase.
 */
exports.getPreDeployContextForExternalRef = function(externalRefServiceContext) {
    let sgName = deployersCommon.getResourceName(externalRefServiceContext);
    winston.info(`EFS - Getting PreDeployContxt for exteranl service ${sgName}`);

    return ec2Calls.getSecurityGroup(sgName, accountConfig.vpc)
        .then(efsSecurityGroup => {
            if(efsSecurityGroup) {
                let preDeployContext = new PreDeployContext(externalRefServiceContext);
                preDeployContext.securityGroups.push(efsSecurityGroup);
                return preDeployContext;
            }
            throw new Error(`EFS - Resources from PreDeploy not found!`);
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
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`EFS - Executing Bind on ${stackName}`);
    let ownSg = ownPreDeployContext.securityGroups[0];
    let sourceSg = dependentOfPreDeployContext.securityGroups[0];

    return ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, ownSg, 
                                                  EFS_SG_PROTOCOL, EFS_PORT, 
                                                  EFS_PORT, accountConfig['vpc'])
        .then(efsSecurityGroup => {
            winston.info(`EFS - Finished Bind on ${stackName}`);
            return new BindContext(ownServiceContext, dependentOfServiceContext);
        });
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
    winston.info(`EFS - Getting BindContext for external resource`);
    let ownSg = externalRefPreDeployContext.securityGroups[0];
    if(!ownSg) {
        throw new Error(`EFS - Error getting BindContext: own security group was not present in PreDeployContext`);
    }
    let sourceSg = dependentOfPreDeployContext.securityGroups[0];
    if(!ownSg) {
        throw new Error(`EFS - Error getting BindContext: source security group was not present in PreDeployContext`);
    }

    return ec2Calls.getSecurityGroup(ownSg.GroupName, accountConfig.vpc)
        .then(efsSecurityGroup => {
            if(ec2Calls.ingressRuleExists(efsSecurityGroup, EFS_PORT, EFS_PORT, EFS_SG_PROTOCOL, sourceSg)) {
                return new BindContext(externalRefServiceContext, dependentOfServiceContext);
            }
            else {
                throw new Error(`EFS - Bind has not been run on external service ${dependentOfServiceContext.serviceName}`);
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
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`EFS - Executing Deploy on ${stackName}`);

    return cloudFormationCalls.getStack(stackName)
        .then(stack => {
            if(!stack) {
                winston.info(`EFS - Creating file system ${stackName}`);
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
                        winston.info(`EFS - Created file system ${stackName}`)
                        let fileSystemId = getFileSystemIdFromStack(createdStack);
                        return getDeployContext(ownServiceContext, fileSystemId, accountConfig['region'], stackName);
                    });
            }
            else {
                winston.info(`EFS - Updates are not supported for this service`);
                let fileSystemId = getFileSystemIdFromStack(stack);
                return getDeployContext(ownServiceContext, fileSystemId, accountConfig['region'], stackName);
            }
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
    winston.info(`EFS - Getting DeployContext for external reference`);
    let externalRefStackName = deployersCommon.getResourceName(externalRefServiceContext);
    return cloudFormationCalls.getStack(externalRefStackName)
        .then(externalStack => {
            if(externalStack) {
                let fileSystemId = getFileSystemIdFromStack(externalStack);
                return getDeployContext(externalRefServiceContext, fileSystemId, accountConfig['region'], externalRefStackName);
            }
            throw new Error(`EFS - Stack ${externalRefStackName} is not deployed!`);
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
    return Promise.reject(new Error("The EFS service doesn't consume events from other services"));
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
    return Promise.reject(new Error("The EFS service doesn't consume events from other services"));
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
    return Promise.reject(new Error("The EFS service doesn't produce events for other services"));
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
exports.producedDeployOutputTypes = [
    'environmentVariables',
    'scripts',
    'securityGroups'
];

/**
 * The list of output types that this service consumes from other dependencies.
 * 
 * If the list is empty, this service cannot consume other services.
 * 
 * Valid list values: environmentVariables, scripts, policies, credentials, securityGroups
 */
exports.consumedDeployOutputTypes = [];
