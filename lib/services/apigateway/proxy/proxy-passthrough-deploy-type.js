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
const handlebarsUtils = require('../../../common/handlebars-utils');
const deployPhaseCommon = require('../../../common/deploy-phase-common');
const util = require('../../../common/util');
const uuid = require('uuid');
const winston = require('winston');
const DeployContext = require('../../../datatypes/deploy-context');
const apigatewayCommon = require('../common');

function uploadDeployableArtifactToS3 (serviceContext, serviceName) {
    let s3FileName = `apigateway-deployable-${uuid()}.zip`;
    winston.info(`${serviceName} - Uploading deployable artifact to S3: ${s3FileName}`);
    let pathToArtifact = getParam(serviceContext.params, 'path_to_code', 'path_to_code');
    return deployPhaseCommon.uploadDeployableArtifactToHandelBucket(serviceContext, pathToArtifact, s3FileName)
        .then(s3ArtifactInfo => {
            winston.info(`${serviceName} - Uploaded deployable artifact to S3: ${s3FileName}`);
            return s3ArtifactInfo;
        });
}

function getCompiledApiGatewayTemplate (stackName, ownServiceContext, dependenciesDeployContexts, s3ObjectInfo, ownPreDeployContext) {
    let serviceParams = ownServiceContext.params;
    let accountConfig = ownServiceContext.accountConfig;

    let handlebarsParams = {
        description: serviceParams.description || `Handel-created API for '${stackName}'`,
        stageName: ownServiceContext.environmentName,
        s3Bucket: s3ObjectInfo.Bucket,
        s3Key: s3ObjectInfo.Key,
        apiName: stackName,
        provisionedMemory: getParam(serviceParams, 'provisioned_memory', 'memory', "128"),
        handlerFunction: getParam(serviceParams, 'handler_function', 'handler'),
        functionTimeout: getParam(serviceParams, 'function_timeout', 'timeout', "3").toString(),
        lambdaRuntime: getParam(serviceParams, 'lambda_runtime', 'runtime'),
        policyStatements: apigatewayCommon.getPolicyStatementsForLambdaRole(ownServiceContext, dependenciesDeployContexts),
        tags: deployPhaseCommon.getTags(ownServiceContext)
    }

    // Add binary media types if specified
    let binaryMediaTypes = getParam(serviceParams, 'binary_media_types')
    if (binaryMediaTypes) {
        handlebarsParams.binaryMediaTypes = [];
        for (let type of binaryMediaTypes) {
            handlebarsParams.binaryMediaTypes.push(type.replace("/", "~1"));
        }
    }

    //Add env vars
    if(serviceParams.proxy) {
        handlebarsParams.environment_variables = apigatewayCommon.getEnvVarsForService(serviceParams.proxy.environment_variables, ownServiceContext, dependenciesDeployContexts)
    }
    else {
        handlebarsParams.environment_variables = apigatewayCommon.getEnvVarsForService(serviceParams.environment_variables, ownServiceContext, dependenciesDeployContexts)
    }
    
    let vpc = getParam(serviceParams, 'vpc');
    if (vpc) {
        handlebarsParams.vpc = true;
        handlebarsParams.vpcSecurityGroupIds = apigatewayCommon.getSecurityGroups(ownPreDeployContext);
        handlebarsParams.vpcSubnetIds = accountConfig.private_subnets;
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/apigateway-proxy-template.yml`, handlebarsParams);
}

function checkForParam(params, oldParamName, newParamName, checkErrors) {
    if(!params[oldParamName]) {
        if(!params.proxy || !params.proxy[newParamName]) {
            checkErrors.push(`'${newParamName}' parameter is required`);
        }
    }
    else {
        winston.warn(`The '${oldParamName}' parameter is deprecated. Use 'proxy.${newParamName}' instead.`);
    }
}

function getParam(params, oldParamName, newParamName, defaultValue) {
    if(params[oldParamName]) {
        return params[oldParamName]
    }
    else if(params.proxy && params.proxy[newParamName]) {
        return params.proxy[newParamName];
    }
    else {
        return defaultValue;
    }
}

exports.check = function(serviceContext, dependenciesServiceContexts, serviceName) {
    let serviceDeployers = util.getServiceDeployers()
    let checkErrors = [];

    let params = serviceContext.params;
    checkForParam(params, 'path_to_code', 'path_to_code', checkErrors);
    checkForParam(params, 'lambda_runtime', 'runtime', checkErrors);
    checkForParam(params, 'handler_function', 'handler', checkErrors);

    if(dependenciesServiceContexts) {
        dependenciesServiceContexts.forEach((dependencyServiceContext) => {
            if (serviceDeployers[dependencyServiceContext.serviceType].producedDeployOutputTypes.indexOf('securityGroups') !== -1 && !params.vpc) {
                checkErrors.push(`${serviceName} - The 'vpc' parameter is required and must be true when declaring dependencies of type ${dependencyServiceContext.serviceType}`);
            }
        })
    }
    return checkErrors;
}

exports.deploy = function(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, serviceName) {
    return uploadDeployableArtifactToS3(ownServiceContext, serviceName)
        .then(s3ObjectInfo => {
            return getCompiledApiGatewayTemplate(stackName, ownServiceContext, dependenciesDeployContexts, s3ObjectInfo, ownPreDeployContext);
        })
        .then(compiledTemplate => {
            let stackTags = deployPhaseCommon.getTags(ownServiceContext);
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, serviceName, stackTags);
        })
        .then(deployedStack => {
            let restApiUrl = apigatewayCommon.getRestApiUrl(deployedStack, ownServiceContext);
            winston.info(`${serviceName} - Finished deploying API Gateway service. The service is available at ${restApiUrl}`);
            return new DeployContext(ownServiceContext);
        });
}