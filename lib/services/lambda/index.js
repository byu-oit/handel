const winston = require('winston');
const handlebarsUtils = require('../../util/handlebars-utils');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const ConsumeEventsContext = require('../../datatypes/consume-events-context');
const accountConfig = require('../../util/account-config')().getAccountConfig();
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


function getCompiledLambdaTemplate(stackName, ownServiceContext, dependenciesDeployContexts, customRole, s3ArtifactInfo) {
    let serviceParams = ownServiceContext.params;
    let memorySize = serviceParams.memory || 128;
    let timeout = serviceParams.timeout || 3;
    let handlebarsParams = {
        functionName: stackName,
        s3ArtifactBucket: s3ArtifactInfo.Bucket,
        s3ArtifactKey: s3ArtifactInfo.Key,
        executionRoleArn: customRole.Arn,
        handler: serviceParams.handler,
        runtime: serviceParams.runtime,
        memorySize: memorySize,
        timeout: timeout
    };

    //Inject environment variables (if any)
    let envVarsToInject = getEnvVariablesToInject(ownServiceContext, dependenciesDeployContexts);
    if (Object.keys(envVarsToInject).length > 0) {
        handlebarsParams.environmentVariables = envVarsToInject;
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

function getPolicyStatementsForLambdaRole(serviceContext) {
    return [
        {
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:*:*:*",
            "Effect": "Allow"
        }
    ].concat(deployersCommon.getAppSecretsAccessPolicyStatements(serviceContext));
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
    winston.info(`Lambda - Getting PreDeployContext for external service`);
    return Promise.resolve(new PreDeployContext(externalRefServiceContext));
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
exports.bind = function(externalRefServiceContext, externalRefPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`Lambda - Bind is not required for this service, skipping it`);
    return Promise.resolve(new BindContext(externalRefServiceContext, dependentOfServiceContext));
}

/**
 * Returns the BindContext for the service. If Bind has not been run yet for
 * this service against the external consuming service, this method should return an error.
 * 
 * This is used by external references to get information about the Bind phase of 
 * an external service.
 *
 * @param {ServiceContext} externalRefServiceContext - The ServiceContext of the external reference service
 * @param {PreDeployContext} externalRefPreDeployContext - The PreDeployContext of the external reference service * 
 * @param {ServiceContext} ownServiceContext - The ServiceContext of the service being consumed
 * @param {PreDeployContext} ownPreDeployContext - The PreDeployContext of the service being consumed
 * @returns {Promise.<BindContext>} - A Promise of the BindContext results from the Bind
 */
exports.getBindContextForExternalRef = function(ownServiceContext, ownPreDeployContext, externalRefServiceContext, externalRefPreDeployContext) {
    winston.info(`Lambda - Getting BindContext for external service`);
    //No bind, so just return empty bind context
    return Promise.resolve(new BindContext(ownServiceContext, externalRefServiceContext));
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

    return deployersCommon.createCustomRoleForService('lambda.amazonaws.com', getPolicyStatementsForLambdaRole(ownServiceContext), ownServiceContext, dependenciesDeployContexts)
        .then(customRole => {
            return uploadDeployableArtifactToS3(ownServiceContext)
                .then(s3ArtifactInfo => {
                    return getCompiledLambdaTemplate(stackName, ownServiceContext, dependenciesDeployContexts, customRole, s3ArtifactInfo);
                });
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
    winston.info(`Lambda - Getting DeployContext for external reference`);
    let externalRefStackName = deployersCommon.getResourceName(externalRefServiceContext);
    return cloudFormationCalls.getStack(externalRefStackName)
        .then(externalRefStack => {
            if(externalRefStack) {
                return getDeployContext(externalRefServiceContext, externalRefStack);
            }
            else {
                throw new Error(`External service ${externalRefServiceContext} does not exist. You must deploy it independently first before trying to reference it in this application!`);
            }
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
    return new Promise((resolve, reject) => {
        winston.info(`Lambda - Getting ConsumeEventsContext for service ${ownServiceContext.serviceName}`);
        let functionName = ownDeployContext.eventOutputs.lambdaName;
        let producerServiceType = externalRefServiceContext.serviceType;
        let principal;
        let sourceArn;
        if (producerServiceType === 'sns') {
            principal = externalRefDeployContext.eventOutputs.principal;
            sourceArn = externalRefDeployContext.eventOutputs.topicArn;
        }
        else {
            return reject(new Error(`Lambda - Unsupported event producer type given: ${producerServiceType}`));
        }

        lambdaCalls.getLambdaPermission(functionName, principal, sourceArn)
            .then(permissionStatement => {
                if(permissionStatement) {
                    return resolve(new ConsumeEventsContext(ownServiceContext, externalRefServiceContext));
                }
                return reject(new Error(`Lambda - ConsumeEvents not run for external service`));
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
