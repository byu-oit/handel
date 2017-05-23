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
const _ = require('lodash');

function getEnvVariablesToInject(serviceContext, dependenciesDeployContexts) {
    let serviceParams = serviceContext.params;
    let envVarsToInject = deployersCommon.getEnvVarsFromDependencyDeployContexts(dependenciesDeployContexts);
    envVarsToInject = _.assign(envVarsToInject, deployersCommon.getEnvVarsFromServiceContext(serviceContext));
    
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
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
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

exports.preDeploy = function (serviceContext) {
    winston.info(`Lambda - PreDeploy is not required for this service, skipping it`);
    return Promise.resolve(new PreDeployContext(serviceContext));
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`Lambda - Bind is not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
}

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

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error("The Lambda service doesn't produce events for other services"));
}

exports.unPreDeploy = function(ownServiceContext) {
    winston.info(`Lambda - UnPreDeploy is not required for this service`);
    return Promise.resolve(new UnPreDeployContext(ownServiceContext));
}

exports.unBind = function(ownServiceContext) {
    winston.info(`Lambda - UnBind is not required for this service`);
    return Promise.resolve(new UnBindContext(ownServiceContext));
}

exports.unDeploy = function (ownServiceContext) {
    return deployersCommon.unDeployCloudFormationStack(ownServiceContext, 'Lambda');
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [];

exports.consumedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];
