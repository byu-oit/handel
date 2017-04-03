const BindContext = require('../../datatypes/bind-context');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const DeployContext = require('../../datatypes/deploy-context');
const cloudformationCalls = require('../../aws/cloudformation-calls');
const util = require('../../util/util');
const handlebarsUtils = require('../../util/handlebars-utils');
const deployersCommon = require('../deployers-common');
const fs = require('fs');
const uuid = require('uuid');
const s3Calls = require('../../aws/s3-calls');
const accountConfig = require('../../util/account-config')().getAccountConfig();
const winston = require('winston');

function getStackParameters(stackName, artifactS3Bucket, artifactS3Key, ownServiceContext, executionRole) {
    let provisionedMemory = ownServiceContext.params.provisioned_memory || "128";
    let functionTimeout = ownServiceContext.params.function_timeout || "3";

    return {
        ApiName: stackName,
        LambdaRoleArn: executionRole.Arn,
        LambdaRuntime: ownServiceContext.params.lambda_runtime,
        ProvisionedMemory: provisionedMemory.toString(),
        HandlerFunction: ownServiceContext.params.handler_function,
        FunctionTimeout: functionTimeout.toString(),
        CodeUriS3Bucket: artifactS3Bucket,
        CodeUriS3Key: artifactS3Key,
        StageName: ownServiceContext.environmentName
    }
}

function uploadArtifactToS3(serviceContext) {
    let pathToArtifact = serviceContext.params.path_to_code;
    let fileStats = fs.lstatSync(pathToArtifact);
    let s3FileName = `apigateway-deployable-${uuid()}`;
    winston.info(`Uploading artifact to S3: ${s3FileName}`);
    if(fileStats.isDirectory()) { //Zip up artifact
        let zippedPath = `/tmp/${s3FileName}.zip`;
        return util.zipDirectoryToFile(pathToArtifact, zippedPath)
            .then(() => {
                return deployersCommon.uploadFileToHandelBucket(serviceContext, zippedPath, s3FileName)
                    .then(s3ObjectInfo => {
                        winston.info(`Uploaded artifact to S3: ${s3FileName}`);
                        //Delete temporary file
                        fs.unlinkSync(zippedPath);
                        return s3ObjectInfo;
                    });
            });
    }
    else { //Is file (i.e. WAR file or some other already-compiled archive), just upload directly
        return deployersCommon.uploadFileToHandelBucket(serviceContext, pathToArtifact, s3FileName)
            .then(s3ObjectInfo => {
                return s3ObjectInfo;
            });
    }
}

function getPolicyStatementForLambdaRole() {
    return {
        "Effect": "Allow",
        "Action": [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
        ],
        "Resource": "*"
    }
}

function getEnvVarsForService(ownServiceEnvironmentVariables, dependenciesDeployContexts) {
    let returnEnvVars = {};

    for(let ownServiceKey in ownServiceEnvironmentVariables) {
        returnEnvVars[ownServiceKey] = ownServiceEnvironmentVariables[ownServiceKey];
    }

    let dependenciesEnvVars = deployersCommon.getEnvVarsFromDependencyDeployContexts(dependenciesDeployContexts);
    for(let dependencyKey in dependenciesEnvVars) {
        returnEnvVars[dependencyKey] = dependenciesEnvVars[dependencyKey];
    }

    return returnEnvVars;
}

/**
 * Checks the given service for required parameters and correctness. This provides
 * a fail-fast mechanism for configuration errors before deploy is attempted.
 *
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
 * @returns {Array} - 0 or more String error messages
 */
exports.check = function(serviceContext) {
    let checkErrors = [];

    let params = serviceContext.params;
    if(!params.path_to_code) {
        checkErrors.push("API Gateway - 'path_to_code' parameter is required");
    }
    if(!params.lambda_runtime) {
        checkErrors.push("API Gateway - 'lambda_runtime' parameter is required");
    }
    if(!params.handler_function) {
        checkErrors.push("API Gateway - 'handler_function' parameter is required");
    }

    return checkErrors;
}

/**
 * Create resources needed for deployment that are also needed for dependency wiring
 * with other services
 *
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
 * @returns {Promise.<PreDeployContext>} - A Promise of the PreDeployContext results from the pre-deploy
 */
exports.preDeploy = function(serviceContext) {
    //TODO - Once VPC support is enabled, create a security group for the Lambda
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
exports.bind = function(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    return Promise.resolve(new BindContext(ownServiceContext));
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
    winston.info(`Deploying API Gateway service ${stackName}`);

    return uploadArtifactToS3(ownServiceContext)
        .then(s3ObjectInfo => {
            return deployersCommon.createCustomRoleForService("lambda.amazonaws.com", getPolicyStatementForLambdaRole(), ownServiceContext, dependenciesDeployContexts)
                .then(role => {
                    return getStackParameters(stackName, s3ObjectInfo.Bucket, s3ObjectInfo.Key, ownServiceContext, role);
                });
        })
        .then(stackParameters => {
            return cloudformationCalls.getStack(stackName)
                .then(stack => {
                    let handlebarsParams = {};
                    let serviceParams = ownServiceContext.params;
                    if(serviceParams.environment_variables) {
                        handlebarsParams.environment_variables = getEnvVarsForService(serviceParams.environment_variables, dependenciesDeployContexts);
                    }
                    return handlebarsUtils.compileTemplate(`${__dirname}/apigateway-proxy-template.yml`, handlebarsParams)
                        .then(compiledTemplate => {
                            if(!stack) { //Create new API gateway service
                                winston.info(`Creating new API Gateway service ${stackName}`);
                                return cloudformationCalls.createStack(stackName, compiledTemplate, cloudformationCalls.getCfStyleStackParameters(stackParameters));
                            }
                            else { //Update existing service
                                winston.info(`Updating existing API Gateway service ${stackName}`);
                                return cloudformationCalls.updateStack(stackName, compiledTemplate, cloudformationCalls.getCfStyleStackParameters(stackParameters));
                            }
                        });
                });
        })
        .then(deployedStack => {
            let restApiId = cloudformationCalls.getOutput("RestApiId", deployedStack);
            let restApiDomain = `${restApiId}.execute-api.${accountConfig.region}.amazonaws.com`;
            let stageName = ownServiceContext.environmentName; //Env name is the stage name
            let restApiUrl = `https://${restApiDomain}/${stageName}/`;
            winston.info(`API Gateway service is available at ${restApiUrl}`);
            return new DeployContext(ownServiceContext);
        });
}