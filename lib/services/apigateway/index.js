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
const DeployContext = require('../../datatypes/deploy-context');
const cloudformationCalls = require('../../aws/cloudformation-calls');
const util = require('../../common/util');
const handlebarsUtils = require('../../common/handlebars-utils');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../common/bind-phase-common');
const uuid = require('uuid');
const accountConfig = require('../../common/account-config')().getAccountConfig();
const winston = require('winston');
const _ = require('lodash');

const SERVICE_NAME = "API Gateway";

function uploadDeployableArtifactToS3(serviceContext) {
    let s3FileName = `apigateway-deployable-${uuid()}.zip`;
    winston.info(`${SERVICE_NAME} - Uploading deployable artifact to S3: ${s3FileName}`);
    return deployPhaseCommon.uploadDeployableArtifactToHandelBucket(serviceContext, s3FileName)
        .then(s3ArtifactInfo => {
            winston.info(`${SERVICE_NAME} - Uploaded deployable artifact to S3: ${s3FileName}`);
            return s3ArtifactInfo;
        });
}

function getPolicyStatementsForLambdaRole(serviceContext, dependenciesDeployContexts) {
    let ownPolicyStatements = JSON.parse(util.readFileSync(`${__dirname}/lambda-role-statements.json`));
    ownPolicyStatements = ownPolicyStatements.concat(deployPhaseCommon.getAppSecretsAccessPolicyStatements(serviceContext));

    return deployPhaseCommon.getAllPolicyStatementsForServiceRole(ownPolicyStatements, dependenciesDeployContexts);
}

function getEnvVarsForService(serviceContext, dependenciesDeployContexts) {
    let returnEnvVars = {};

    if (serviceContext.params.environment_variables) {
        returnEnvVars = _.assign(returnEnvVars, serviceContext.params.environment_variables);
    }
    let dependenciesEnvVars = deployPhaseCommon.getEnvVarsFromDependencyDeployContexts(dependenciesDeployContexts);
    returnEnvVars = _.assign(returnEnvVars, dependenciesEnvVars);
    let handelInjectedEnvVars = deployPhaseCommon.getEnvVarsFromServiceContext(serviceContext);
    returnEnvVars = _.assign(returnEnvVars, handelInjectedEnvVars);

    return returnEnvVars;
}

function getCompiledApiGatewayTemplate(stackName, ownServiceContext, dependenciesDeployContexts, s3ObjectInfo) {
    let serviceParams = ownServiceContext.params;

    let policyStatements = getPolicyStatementsForLambdaRole(ownServiceContext, dependenciesDeployContexts);

    let description = serviceParams.description || 'Handel-created function '+stackName;
    let provisionedMemory = serviceParams.provisioned_memory || "128";
    let functionTimeout = serviceParams.function_timeout || "3";

    let handlebarsParams = {
        description: description,
        stageName: ownServiceContext.environmentName,
        s3Bucket: s3ObjectInfo.Bucket,
        s3Key: s3ObjectInfo.Key,
        apiName: stackName,
        provisionedMemory,
        handlerFunction: serviceParams.handler_function,
        functionTimeout: functionTimeout.toString(),
        lambdaRuntime: serviceParams.lambda_runtime,
        policyStatements,
        tags: deployPhaseCommon.getTags(ownServiceContext)
    }

		// Add binary media types if specified
		if(serviceParams.binary_media_types)
    {
      handlebarsParams.binaryMediaTypes=[];
      for(let type of serviceParams.binary_media_types)
      {
        handlebarsParams.binaryMediaTypes.push(type.replace("/","~1"));
      }
    }

    //Add env vars
    handlebarsParams.environment_variables = getEnvVarsForService(ownServiceContext, dependenciesDeployContexts);

    return handlebarsUtils.compileTemplate(`${__dirname}/apigateway-proxy-template.yml`, handlebarsParams);
}

function getDeployContext(serviceContext) {
    return new DeployContext(serviceContext);
}

function getRestApiUrl(cfStack, serviceContext) {
    let restApiId = cloudformationCalls.getOutput("RestApiId", cfStack);
    let restApiDomain = `${restApiId}.execute-api.${accountConfig.region}.amazonaws.com`;
    let stageName = serviceContext.environmentName; //Env name is the stage name
    let restApiUrl = `https://${restApiDomain}/${stageName}/`;
    return restApiUrl;
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
        checkErrors.push(`${SERVICE_NAME} - 'path_to_code' parameter is required`);
    }
    if (!params.lambda_runtime) {
        checkErrors.push(`${SERVICE_NAME} - 'lambda_runtime' parameter is required`);
    }
    if (!params.handler_function) {
        checkErrors.push(`${SERVICE_NAME} - 'handler_function' parameter is required`);
    }

    return checkErrors;
}

exports.preDeploy = function (serviceContext) {
    //TODO - Once VPC support is enabled, we'll probably need to create a security group for the Lambda
    return preDeployPhaseCommon.preDeployNotRequired(serviceContext, SERVICE_NAME);
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    return bindPhaseCommon.bindNotRequired(ownServiceContext, dependentOfServiceContext, SERVICE_NAME);
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying service ${stackName}`);

    return uploadDeployableArtifactToS3(ownServiceContext)
        .then(s3ObjectInfo => {
            return getCompiledApiGatewayTemplate(stackName, ownServiceContext, dependenciesDeployContexts, s3ObjectInfo);
        })
        .then(compiledTemplate => {
            let stackTags = deployPhaseCommon.getTags(ownServiceContext);
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME, stackTags);
        })
        .then(deployedStack => {
            let restApiUrl = getRestApiUrl(deployedStack, ownServiceContext);
            winston.info(`${SERVICE_NAME} - Deployed service is available at ${restApiUrl}`);
            return getDeployContext(ownServiceContext);
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't consume events from other services`));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't produce events for other services`));
}

exports.unPreDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unPreDeployNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.unBind = function (ownServiceContext) {
    return deletePhasesCommon.unBindNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.unDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unDeployCloudFormationStack(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [];

exports.consumedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];
