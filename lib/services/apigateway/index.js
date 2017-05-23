/*
 * Copyright 2017 Brigham Young University
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
const BindContext = require('../../datatypes/bind-context');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const DeployContext = require('../../datatypes/deploy-context');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const cloudformationCalls = require('../../aws/cloudformation-calls');
const util = require('../../util/util');
const handlebarsUtils = require('../../util/handlebars-utils');
const deployersCommon = require('../deployers-common');
const uuid = require('uuid');
const accountConfig = require('../../util/account-config')().getAccountConfig();
const winston = require('winston');
const _ = require('lodash');


function uploadDeployableArtifactToS3(serviceContext) {
    let s3FileName = `apigateway-deployable-${uuid()}.zip`;
    winston.info(`API Gateway - Uploading deployable artifact to S3: ${s3FileName}`);
    return deployersCommon.uploadDeployableArtifactToHandelBucket(serviceContext, s3FileName)
        .then(s3ArtifactInfo => {
            winston.info(`API Gateway - Uploaded deployable artifact to S3: ${s3FileName}`);
            return s3ArtifactInfo;
        });
}

function getPolicyStatementsForLambdaRole(serviceContext, dependenciesDeployContexts) {
    let ownPolicyStatements = JSON.parse(util.readFileSync(`${__dirname}/lambda-role-statements.json`));
    ownPolicyStatements = ownPolicyStatements.concat(deployersCommon.getAppSecretsAccessPolicyStatements(serviceContext));

    return deployersCommon.getAllPolicyStatementsForServiceRole(ownPolicyStatements, dependenciesDeployContexts);
}

function getEnvVarsForService(serviceContext, dependenciesDeployContexts) {
    let returnEnvVars = {};

    if (serviceContext.params.environment_variables) {
        returnEnvVars = _.assign(returnEnvVars, serviceContext.params.environment_variables);
    }
    let dependenciesEnvVars = deployersCommon.getEnvVarsFromDependencyDeployContexts(dependenciesDeployContexts);
    returnEnvVars = _.assign(returnEnvVars, dependenciesEnvVars);
    let handelInjectedEnvVars = deployersCommon.getEnvVarsFromServiceContext(serviceContext);
    returnEnvVars = _.assign(returnEnvVars, handelInjectedEnvVars);

    return returnEnvVars;
}

function getCompiledApiGatewayTemplate(stackName, ownServiceContext, dependenciesDeployContexts, s3ObjectInfo) {
    let serviceParams = ownServiceContext.params;

    let policyStatements = getPolicyStatementsForLambdaRole(ownServiceContext, dependenciesDeployContexts);

    let provisionedMemory = serviceParams.provisioned_memory || "128";
    let functionTimeout = serviceParams.function_timeout || "3";

    let handlebarsParams = {
        stageName: ownServiceContext.environmentName,
        s3Bucket: s3ObjectInfo.Bucket,
        s3Key: s3ObjectInfo.Key,
        apiName: stackName,
        provisionedMemory,
        handlerFunction: serviceParams.handler_function,
        functionTimeout: functionTimeout.toString(),
        lambdaRuntime: serviceParams.lambda_runtime,
        policyStatements
    }

    //Add tags if necessary
    if (serviceParams.tags) {
        handlebarsParams.tags = serviceParams.tags;
    }

    //Add env vars
    handlebarsParams.environment_variables = getEnvVarsForService(ownServiceContext, dependenciesDeployContexts);

    return handlebarsUtils.compileTemplate(`${__dirname}/apigateway-proxy-template.yml`, handlebarsParams);
}

function getDeployContext(serviceContext) {
    return new DeployContext(serviceContext);
}


/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext) {
    let checkErrors = [];

    let params = serviceContext.params;
    if (!params.path_to_code) {
        checkErrors.push("API Gateway - 'path_to_code' parameter is required");
    }
    if (!params.lambda_runtime) {
        checkErrors.push("API Gateway - 'lambda_runtime' parameter is required");
    }
    if (!params.handler_function) {
        checkErrors.push("API Gateway - 'handler_function' parameter is required");
    }

    return checkErrors;
}

exports.preDeploy = function (serviceContext) {
    winston.info(`API Gateway - PreDeploy not currently required for this service, skipping it`);
    //TODO - Once VPC support is enabled, create a security group for the Lambda
    return Promise.resolve(new PreDeployContext(serviceContext));
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`API Gateway - Bind not currently required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`API Gateway - Deploying service ${stackName}`);

    return uploadDeployableArtifactToS3(ownServiceContext)
        .then(s3ObjectInfo => {
            return getCompiledApiGatewayTemplate(stackName, ownServiceContext, dependenciesDeployContexts, s3ObjectInfo);
        })
        .then(compiledTemplate => {
            return cloudformationCalls.getStack(stackName)
                .then(stack => {
                    if (!stack) { //Create new API gateway service
                        winston.info(`API Gateway - Creating new API ${stackName}`);
                        return cloudformationCalls.createStack(stackName, compiledTemplate, []);
                    }
                    else { //Update existing service
                        winston.info(`API Gateway - Updating existing API ${stackName}`);
                        return cloudformationCalls.updateStack(stackName, compiledTemplate, []);
                    }
                });
        })
        .then(deployedStack => {
            let restApiId = cloudformationCalls.getOutput("RestApiId", deployedStack);
            let restApiDomain = `${restApiId}.execute-api.${accountConfig.region}.amazonaws.com`;
            let stageName = ownServiceContext.environmentName; //Env name is the stage name
            let restApiUrl = `https://${restApiDomain}/${stageName}/`;
            winston.info(`API Gateway - Deployed service is available at ${restApiUrl}`);
            return getDeployContext(ownServiceContext);
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error("The API Gateway service doesn't consume events from other services"));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error("The API Gateway service doesn't produce events for other services"));
}

exports.unPreDeploy = function (ownServiceContext) {
    winston.info(`API Gateway - UnPreDeploy is not required for this service`);
    return Promise.resolve(new UnPreDeployContext(ownServiceContext));
}

exports.unBind = function (ownServiceContext) {
    winston.info(`API Gateway - UnBind is not required for this service`);
    return Promise.resolve(new UnBindContext(ownServiceContext));
}

exports.unDeploy = function (ownServiceContext) {
    return deployersCommon.unDeployCloudFormationStack(ownServiceContext, 'API Gateway');
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [];

exports.consumedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];