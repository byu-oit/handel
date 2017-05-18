const winston = require('winston');
const handlebarsUtils = require('../../util/handlebars-utils');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const ConsumeEventsContext = require('../../datatypes/consume-events-context');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const util = require('../../util/util');
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const lambdaCalls = require('../../aws/lambda-calls');
const deployersCommon = require('../deployers-common');
const uuid = require('uuid');

function getEnvVariablesToInject(serviceContext, dependenciesDeployContexts) {
    let serviceParams = serviceContext.params;
    let envVarsToInject = deployersCommon.getEnvVarsFromDependencyDeployContexts(dependenciesDeployContexts);
    if (serviceParams.environment_variables) {
        for (let envVarName in serviceParams.environment_variables) {
            envVarsToInject[envVarName] = serviceParams.environment_variables[envVarName];
        }
    }
    return envVarsToInject;
}


function getCompiledLambdaTemplate(stackName, ownServiceContext, dependenciesDeployContexts, s3ArtifactInfo) {
    let serviceParams = ownServiceContext.params;
    
    let policyStatements = getPolicyStatementsForLambdaRole(ownServiceContext, dependenciesDeployContexts);
    
    let memorySize = serviceParams.memory || 128;
    let timeout = serviceParams.timeout || 3;
    let handlebarsParams = {
        functionName: stackName,
        s3ArtifactBucket: s3ArtifactInfo.Bucket,
        s3ArtifactKey: s3ArtifactInfo.Key,
        handler: serviceParams.handler,
        runtime: serviceParams.runtime,
        memorySize: memorySize,
        timeout: timeout,
        policyStatements
    };

    //Inject environment variables (if any)
    let envVarsToInject = getEnvVariablesToInject(ownServiceContext, dependenciesDeployContexts);
    if (Object.keys(envVarsToInject).length > 0) {
        handlebarsParams.environmentVariables = envVarsToInject;
    }

    //Inject tags (if any)
    if (serviceParams.tags) {
        handlebarsParams.tags = serviceParams.tags;
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/lambda-template.yml`, handlebarsParams)
}

function getDeployContext(serviceContext, cfStack) {
    let deployContext = new DeployContext(serviceContext);
    deployContext.eventOutputs.lambdaArn = cloudFormationCalls.getOutput('FunctionArn', cfStack);
    deployContext.eventOutputs.lambdaName = cloudFormationCalls.getOutput('FunctionName', cfStack);
    return deployContext;
}

function uploadDeployableArtifactToS3(serviceContext) {
    let s3FileName = `lambda-deployable-${uuid()}.zip`;
    winston.info(`Lambda - Uploading deployable artifact to S3: ${s3FileName}`);
    return deployersCommon.uploadDeployableArtifactToHandelBucket(serviceContext, s3FileName)
        .then(s3ArtifactInfo => {
            winston.info(`Lambda - Uploaded deployable artifact to S3: ${s3FileName}`);
            return s3ArtifactInfo;
        });
}

function getPolicyStatementsForLambdaRole(serviceContext, dependenciesDeployContexts) {
    let ownPolicyStatements = JSON.parse(util.readFileSync(`${__dirname}/lambda-role-statements.json`));
    ownPolicyStatements = ownPolicyStatements.concat(deployersCommon.getAppSecretsAccessPolicyStatements(serviceContext));

    return deployersCommon.getAllPolicyStatementsForServiceRole(ownPolicyStatements, dependenciesDeployContexts);
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
    if (!serviceParams.path_to_code) {
        errors.push("Lambda - The 'path_to_code' parameter is required");
    }
    if (!serviceParams.handler) {
        errors.push("Lambda - The 'handler' parameter is required");
    }
    if (!serviceParams.runtime) {
        errors.push("Lambda - The 'runtime' parameter is required");
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
exports.preDeploy = function (serviceContext) {
    winston.info(`Lambda - PreDeploy is not required for this service, skipping it`);
    return Promise.resolve(new PreDeployContext(serviceContext));
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
    winston.info(`Lambda - Bind is not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
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
    winston.info(`Lambda - Executing Deploy on ${stackName}`);

    return uploadDeployableArtifactToS3(ownServiceContext)
        .then(s3ArtifactInfo => {
            return getCompiledLambdaTemplate(stackName, ownServiceContext, dependenciesDeployContexts, s3ArtifactInfo);
        })
        .then(compiledLambdaTemplate => {
            return cloudFormationCalls.getStack(stackName)
                .then(stack => {
                    if (!stack) {
                        winston.info(`Lambda - Creating Lambda function ${stackName}`);
                        return cloudFormationCalls.createStack(stackName, compiledLambdaTemplate, []);
                    }
                    else {
                        winston.info(`Lambda - Updating Lambda function ${stackName}`);
                        return cloudFormationCalls.updateStack(stackName, compiledLambdaTemplate, []);
                    }
                })
        })
        .then(deployedStack => {
            winston.info(`Lambda - Finished deploying Lambda function ${stackName}`);
            return getDeployContext(ownServiceContext, deployedStack);
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
    //TODO - DynamoDB streams will differ from this model
    return new Promise((resolve, reject) => {
        winston.info(`Lambda - Consuming events from service '${producerServiceContext.serviceName}' for service '${ownServiceContext.serviceName}'`);
        let functionName = ownDeployContext.eventOutputs.lambdaName;
        let producerServiceType = producerServiceContext.serviceType;
        let principal;
        let sourceArn;
        if (producerServiceType === 'sns') {
            principal = producerDeployContext.eventOutputs.principal;
            sourceArn = producerDeployContext.eventOutputs.topicArn;
        }
        else if(producerServiceType === 'cloudwatchevent') {
            principal = producerDeployContext.eventOutputs.principal;
            sourceArn = producerDeployContext.eventOutputs.eventRuleArn;
        }
        else {
            return reject(new Error(`Lambda - Unsupported event producer type given: ${producerServiceType}`));
        }

        return lambdaCalls.addLambdaPermissionIfNotExists(functionName, principal, sourceArn)
            .then(permissionStatement => {
                winston.info(`Lambda - Allowed consuming events from ${producerServiceContext.serviceName} for ${ownServiceContext.serviceName}`);
                return resolve(new ConsumeEventsContext(ownServiceContext, producerServiceContext));
            });
    });
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
    return Promise.reject(new Error("The Lambda service doesn't produce events for other services"));
}


/**
 * This phase is part of the delete lifecycle. In this phase, the service should remove all resources created in PreDeploy.
 * 
 * @param {ServiceContext} ownServiceContext - The ServiceContext of the service being deleted.
 * @returns {Promise.<UnPreDeployContext>} - The UnPreDeployContext that represents the deletion of predeploy resources for this service
 */
exports.unPreDeploy = function(ownServiceContext) {
    winston.info(`Lambda - UnPreDeploy is not required for this service`);
    return Promise.resolve(new UnPreDeployContext(ownServiceContext));
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
exports.unBind = function(ownServiceContext) {
    winston.info(`Lambda - UnBind is not required for this service`);
    return Promise.resolve(new UnBindContext(ownServiceContext));
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
    return deployersCommon.unDeployCloudFormationStack(ownServiceContext, 'Lambda');
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
    'policies'
];
