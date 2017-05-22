const winston = require('winston');
const ec2Calls = require('../../aws/ec2-calls');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../util/account-config')().getAccountConfig();
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployersCommon = require('../deployers-common');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const handlebarsUtils = require('../../util/handlebars-utils');
const uuid = require('uuid');

const REDIS_PORT = 6379;
const REDIS_SG_PROTOCOL = "tcp";

function getDeployContext(serviceContext, cfStack) {
    let deployContext = new DeployContext(serviceContext);

    // Set port and address environment variables
    let portEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'PORT');
    let port = cloudFormationCalls.getOutput('CachePort', cfStack);
    deployContext.environmentVariables[portEnv] = port;
    let addressEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'ADDRESS');
    let address = cloudFormationCalls.getOutput('CacheAddress', cfStack);
    deployContext.environmentVariables[addressEnv] = address;
    return deployContext;
}

/**
 * Given the stack name, returns the name of the Redis cluster
 * 
 * Redis only allows for a 20-char max cluster name, which means we have to truncate our stack
 * name to fit in it.
 */
function getClusterName(serviceContext) {
    let appFragment = serviceContext.appName.substring(0,8);
    let envFragement = serviceContext.environmentName.substring(0,3);
    let serviceFragment = serviceContext.serviceName.substring(0,3);
    let uuidFragment = uuid().substring(0,3); //Add a few randomish characters on the end in case there are any collisions by truncating the app, env, and service values
    return `${appFragment}-${envFragement}-${serviceFragment}-${uuidFragment}`;
}

function getCacheParameterGroupFamily(redisVersion) {
    if(redisVersion.startsWith('2.6')) {
        return 'redis2.6';
    }
    else if(redisVersion.startsWith('2.8')) {
        return 'redis2.8';
    }
    else {
        return 'redis3.2';
    }
}

function getDefaultCacheParameterGroup(redisVersion, numShards) {
    if(redisVersion.startsWith('2.6')) {
        return 'default.redis2.6';
    }
    else if(redisVersion.startsWith('2.8')) {
        return 'default.redis2.6';
    }
    // else if(redisVersion.startsWith('3.2') && numShards > 1) {
    //     return 'default.redis3.2.cluster.on';
    // }
    else {
        return 'default.redis3.2';
    }
}

function getCompiledRedisTemplate(stackName, ownServiceContext, ownPreDeployContext) {
    let serviceParams = ownServiceContext.params;

    let clusterName = getClusterName(ownServiceContext);
    let redisSecurityGroupId = ownPreDeployContext['securityGroups'][0].GroupId;
    let cacheSubnetGroup = accountConfig.elasticache_subnet_group;
    let instanceType = serviceParams.instance_type;
    let redisVersion = serviceParams.redis_version;
    // let shards = serviceParams.shards || 1;
    let readReplicas = serviceParams.read_replicas || 0;

    let handlebarsParams = {
        instanceType,
        cacheSubnetGroup,
        redisVersion,
        stackName,
        clusterName,
        redisSecurityGroupId,
        // shards,
        numNodes: readReplicas + 1
    }

    //Add tags (if present)
    if (serviceParams.tags) {
        handlebarsParams.tags = serviceParams.tags;
    }

    //Either create custom parameter group if params are specified, or just use default
    if(serviceParams.cache_parameters) {
        handlebarsParams.cacheParameters = serviceParams.cache_parameters;
        handlebarsParams.cacheParameterGroupFamily = getCacheParameterGroupFamily(redisVersion);
    }
    else {
        handlebarsParams.defaultCacheParameterGroup = getDefaultCacheParameterGroup(redisVersion);
    }

    // if(shards === 1) { //Cluster mode disabled
        if(readReplicas === 0) { //No replication group
            return handlebarsUtils.compileTemplate(`${__dirname}/redis-single-no-repl-template.yml`, handlebarsParams);
        }
        else { //Replication group
            return handlebarsUtils.compileTemplate(`${__dirname}/redis-single-repl-template.yml`, handlebarsParams);
        }
    // }
    // else { //Cluster mode enabled (includes replication group)
    //     return handlebarsUtils.compileTemplate(`${__dirname}/redis-cluster-template.yml`, handlebarsParams);
    // }
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
    let serviceParams = serviceContext.params;

    if(!serviceParams.instance_type) {
        errors.push(`Redis - The 'instance_type' parameter is required`);
    }
    if(!serviceParams.redis_version) {
        errors.push(`Redis - The 'redis_version' parameter is required`);
    }

    if(serviceParams.read_replicas) {
        if(serviceParams.read_replicas < 0 || serviceParams.read_replicas > 5) {
            errors.push(`Redis - The 'read_replicas' parameter may only have a value of 0-5`);
        }
        if(serviceParams.read_replicas > 0 && (serviceParams.instance_type.includes('t2') || serviceParams.instance_type.includes("t1"))) {
            errors.push(`Redis - You may not use the 't1' and 't2' instance types when using any read replicas`);
        }
    }
    // if(serviceParams.num_shards) {
    //     if(serviceParams.num_shards < 1 || serviceParams.num_shards > 15) {
    //         errors.push(`Redis - The 'num_shards' parameter may only have a value of 1-15`);
    //     }
    //     if(serviceParams.num_shards > 1 && (serviceParams.redis_version.includes("2.6") || serviceParams.redis_version.includes('2.8'))) { //Cluster mode enabled
    //         errors.push(`Redis - You may not use cluster mode (num_shards > 1) unless you are using version 3.2 or higher`);
    //     }
    // }

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
    winston.info(`Redis - Executing PreDeploy on '${sgName}'`);

    return deployersCommon.createSecurityGroupForService(sgName, false)
        .then(securityGroup => {
            winston.info(`Redis - Finished PreDeploy on '${sgName}'`);
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
exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`Redis - Executing Bind on '${stackName}'`);
    let ownSg = ownPreDeployContext.securityGroups[0];
    let sourceSg = dependentOfPreDeployContext.securityGroups[0];

    return ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, ownSg, REDIS_SG_PROTOCOL, REDIS_PORT, REDIS_PORT, accountConfig.vpc)
        .then(() => {
            winston.info(`Redis - Finished Bind on '${stackName}'`);
            return new BindContext(ownServiceContext, dependentOfServiceContext);
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
exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`Redis - Executing Deploy on '${stackName}'`);

    return getCompiledRedisTemplate(stackName, ownServiceContext, ownPreDeployContext)
        .then(compiledTemplate => {
            return cloudFormationCalls.getStack(stackName)
                .then(stack => {
                    if (!stack) {
                        winston.info(`Redis - Creating new Redis instance '${stackName}'`);
                        return cloudFormationCalls.createStack(stackName, compiledTemplate, [])
                    }
                    else {
                        winston.info(`Redis - Updating existing Redis instance '${stackName}'`);
                        return cloudFormationCalls.updateStack(stackName, compiledTemplate, []);
                    }
                });
        })
        .then(deployedStack => {
            winston.info(`Redis - Finished Deploy on '${stackName}'`);
            return getDeployContext(ownServiceContext, deployedStack)
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
    return Promise.reject(new Error("The Redis service doesn't consume events from other services"));
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
    return Promise.reject(new Error("The Redis service doesn't produce events for other services"));
}

/**
 * This phase is part of the delete lifecycle. In this phase, the service should remove all resources created in PreDeploy.
 * 
 * @param {ServiceContext} ownServiceContext - The ServiceContext of the service being deleted.
 * @returns {Promise.<UnPreDeployContext>} - The UnPreDeployContext that represents the deletion of predeploy resources for this service
 */
exports.unPreDeploy = function (ownServiceContext) {
    let sgName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`Redis - Executing UnPreDeploy on '${sgName}'`);

    return deployersCommon.deleteSecurityGroupForService(sgName)
        .then(success => {
            winston.info(`EFS - Finished UnPreDeploy on '${sgName}'`);
            return new UnPreDeployContext(ownServiceContext);
        });
}

/**
 * This phase is part of the delete lifecycle. In this phase, the service should remove all bindings on preDeploy resources.
 * 
 * Note that, unlike the Bind phase, this UnBind phase only takes a ServiceContext. Because the resource is being deleted, we
 * don't need to execute UnBind for each event binding combination. Instead, we can just remove all bindings simultaneously in
 * a single UnBind call.
 * 
 * @param {ServiceContext} ownServiceContext - The ServiceContext of this service being deleted
 * @returns {Promise.<UnBindContext>} - The UnBindContext that represents the unbinding of this service.
 */
exports.unBind = function (ownServiceContext) {
    let sgName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`Redis - Executing UnBind on ${sgName}`);

    return deployersCommon.unBindAllOnSg(sgName)
        .then(success => {
            winston.info(`Redis - Finished UnBind on ${sgName}`);
            return new UnBindContext(ownServiceContext);
        });
}

/**
 * This phase is part of the delete lifecycle. In this phase, the service should delete itself.
 * 
 * Note that the delete lifecycle has no 'unConsumeEvents' or 'unProduceEvents'. In most cases, deleting the
 * service will automatically delete any event bindings the service itself has, but in some cases this phase will
 * also need to manually remove event bindings. An example of this is CloudWatch Events, which requires that
 * you remove all targets before you can delete the service.
 * 
 * @param {ServiceContext} ownServiceContext = The ServiceContext of this service being deleted
 * @returns {Promise.<UnDeployContext>} - The UnDeployContext that represents the deletion of this service
 */
exports.unDeploy = function (ownServiceContext) {
    return deployersCommon.unDeployCloudFormationStack(ownServiceContext, 'Redis');
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
exports.producedDeployOutputTypes = [
    'environmentVariables',
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
