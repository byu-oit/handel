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
const _ = require('lodash');
const util = require('../../../common/util');
const uuid = require('uuid');
const winston = require('winston');
const DeployContext = require('../../../datatypes/deploy-context').DeployContext;
const apigatewayCommon = require('../common');
const fs = require('fs');
const tmp = require('tmp');

const VALID_METHOD_NAMES = [
    'get',
    'put',
    'post',
    'delete',
    'options',
    'head',
    'patch'
]

function loadSwaggerFile(ownServiceContext) {
    let pathToSwagger = ownServiceContext.params.swagger
    try {
        let swaggerFileStats = fs.lstatSync(pathToSwagger);
        let swaggerContents;
        if (swaggerFileStats.isDirectory()) { //Look for swagger.json
            let yamlPath = `${pathToSwagger}/swagger.yml`;
            let jsonPath = `${pathToSwagger}/swagger.json`;
            if (fs.existsSync(yamlPath)) {
                swaggerContents = util.readYamlFileSync(yamlPath)
            }
            else if (fs.existsSync(jsonPath)) {
                swaggerContents = util.readJsonFileSync(jsonPath);
            }
        }
        else { //Just load file directly
            if (pathToSwagger.endsWith('.yml') || pathToSwagger.endsWith('.yaml')) {
                swaggerContents = util.readYamlFileSync(pathToSwagger);
            }
            else {
                swaggerContents = util.readJsonFileSync(pathToSwagger);
            }
        }

        if (!swaggerContents) {
            throw new Error(`Couldn't read swagger file from '${pathToSwagger}'`);
        }
        return swaggerContents;
    }
    catch (e) {
        throw new Error(`Couldn't read swagger file from '${pathToSwagger}'`)
    }
}

function getLambdasToCreate(stackName, swagger, ownServiceContext, dependenciesDeployContexts) {
    let functionConfigs = [];
    let lambdaDefinitions = swagger['x-lambda-functions'];
    for (let functionName in lambdaDefinitions) {
        let functionDef = lambdaDefinitions[functionName];
        functionConfigs.push({
            name: functionName,
            provisionedMemory: functionDef.memory || '128',
            timeout: functionDef.timeout || '5',
            handler: functionDef.handler,
            runtime: functionDef.runtime,
            pathToArtifact: functionDef.path_to_code,
            environmentVariables: apigatewayCommon.getEnvVarsForService(functionDef.environment_variables, ownServiceContext, dependenciesDeployContexts)
        });
    }
    return functionConfigs;
}

function getCompiledApiGatewayTemplate(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, lambdasToCreate, swaggerS3ArtifactInfo, stackTags) {
    let params = ownServiceContext.params;
    let accountConfig = ownServiceContext.accountConfig;

    let handlebarsParams = {
        stageName: ownServiceContext.environmentName,
        lambdasToCreate,
        swaggerS3ArtifactInfo,
        apiName: stackName,
        description: params.description || `Handel-created API for ${stackName}`,
        policyStatements: apigatewayCommon.getPolicyStatementsForLambdaRole(ownServiceContext, dependenciesDeployContexts),
        tags: stackTags,
        deploymentIdSuffix: Math.floor(Math.random() * 10000) //This is required because CF won't update an API deployment unless the resource has a different name
    }

    // Add binary media types if specified
    let binaryMediaTypes = params.binary_media_types
    if (binaryMediaTypes) {
        handlebarsParams.binaryMediaTypes = [];
        for (let type of binaryMediaTypes) {
            handlebarsParams.binaryMediaTypes.push(type.replace("/", "~1"));
        }
    }

    if (params.vpc) {
        handlebarsParams.vpc = true;
        handlebarsParams.vpcSecurityGroupIds = apigatewayCommon.getSecurityGroups(ownPreDeployContext);
        handlebarsParams.vpcSubnetIds = accountConfig.private_subnets;
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/apigateway-swagger-template.yml`, handlebarsParams);
}

function getHttpPassthroughPathParamsMapping(pathParams) {
    let mappedParams = {};
    for (let origParam in pathParams) {
        let httpPassthroughParam = pathParams[origParam];
        mappedParams[`integration.request.path.${origParam}`] = `method.request.path.${httpPassthroughParam}`
    }
    return mappedParams;
}

function isMethodDef(methodName) {
    if(VALID_METHOD_NAMES.includes(methodName)) {
        return true;
    }
    else { 
        return false;
    }
}

function enrichSwagger(stackName, originalSwagger, accountConfig) {
    let enrichedSwagger = _.cloneDeep(originalSwagger);

    let paths = enrichedSwagger.paths;
    for (let pathName in paths) {
        let path = paths[pathName];
        for (let methodName in path) {
            if(!isMethodDef(methodName)) { continue; }

            let method = path[methodName];
            let requestedFunction = method['x-lambda-function'];
            let httpPassthroughUrl = method['x-http-passthrough-url'] || path['x-http-passthrough-url']; //Support it either at the method or path level. Path level configures it for all methods
            if (requestedFunction) { //User wants to use a Lambda function handler
                if (!enrichedSwagger['x-lambda-functions'][requestedFunction]) {
                    throw new Error(`Lambda function referenced in one of your paths but not defined in 'x-lambda-functions': '${requestedFunction}'`);
                }
                let fullFunctionName = `${stackName}-${requestedFunction}`;
                let functionArn = `arn:aws:lambda:${accountConfig.region}:${accountConfig.account_id}:function:${fullFunctionName}`;
                let functionUri = `arn:aws:apigateway:${accountConfig.region}:lambda:path/2015-03-31/functions/${functionArn}/invocations`;

                let apiGatewayIntegration = method['x-amazon-apigateway-integration'];
                if (apiGatewayIntegration) { //User already provided their own integration configuration, so we'll just enrich it with Lambda info
                    apiGatewayIntegration.type = 'aws';
                    apiGatewayIntegration.uri = functionUri;
                    apiGatewayIntegration.httpMethod = 'POST';
                    if (!apiGatewayIntegration.passthroughBehavior) { //Only provide this if the user hasn't specified their own
                        apiGatewayIntegration.passthroughBehavior = 'when_no_match';
                    }
                }
                else { //User hasn't already specified integration config, so we'll just use Lambda proxy
                    method['x-amazon-apigateway-integration'] = {
                        uri: functionUri,
                        passthroughBehavior: 'when_no_match',
                        httpMethod: 'POST',
                        type: 'aws_proxy'
                    }
                }
            }
            else if (httpPassthroughUrl) { //User wants to use HTTP passthrough
                method['x-amazon-apigateway-integration'] = {
                    uri: httpPassthroughUrl,
                    passthroughBehavior: 'when_no_match',
                    httpMethod: methodName.toUpperCase(),
                    type: 'http_proxy'
                }

                let pathParamsMapping = method['x-http-passthrough-path-params'] || path['x-http-passthrough-path-params']; //Support it either at the method or path level. Path level configures it for all methods
                if (pathParamsMapping) {
                    method['x-amazon-apigateway-integration']['requestParameters'] = getHttpPassthroughPathParamsMapping(pathParamsMapping)
                }
            }
        }
    }

    return enrichedSwagger;
}

function uploadSwaggerToS3(ownServiceContext, enrichedSwagger) {
    let tmpDir = tmp.dirSync({ unsafeCleanup: true });
    let swaggerFilePath = `${tmpDir.name}/swagger.json`;
    fs.writeFileSync(swaggerFilePath, JSON.stringify(enrichedSwagger), 'utf-8');
    let s3FileName = `apigateway-deployable-swagger-${uuid()}.zip`;
    return deployPhaseCommon.uploadDeployableArtifactToHandelBucket(ownServiceContext, swaggerFilePath, s3FileName)
        .then(s3ArtifactInfo => {
            tmpDir.removeCallback();
            return s3ArtifactInfo;
        });
}

function uploadDeployableArtifactsToS3(ownServiceContext, lambdasToCreate, serviceName, enrichedSwagger) {
    let uploadPromises = [];

    for (let lambdaConfig of lambdasToCreate) {
        let s3FileName = `apigateway-deployable-${lambdaConfig.name}-${uuid()}.json`;
        winston.info(`${serviceName} - Uploading deployable artifact to S3: ${s3FileName}`);
        let pathToArtifact = lambdaConfig.pathToArtifact;
        let uploadPromise = deployPhaseCommon.uploadDeployableArtifactToHandelBucket(ownServiceContext, pathToArtifact, s3FileName)
            .then(s3ArtifactInfo => {
                winston.info(`${serviceName} - Uploaded deployable artifact to S3: ${s3FileName}`);
                lambdaConfig.s3ArtifactInfo = s3ArtifactInfo;
            });
        uploadPromises.push(uploadPromise);
    }

    return Promise.all(uploadPromises)
        .then(() => {
            return lambdasToCreate; //This is built-up dynamically above
        });
}

exports.check = function (ownServiceContext, dependenciesServiceContexts, serviceName) {
    let checkErrors = [];

    //TODO - Probably parse Swagger file and check it if we get troubles

    return checkErrors;
}

exports.deploy = function (stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, serviceName) {
    return Promise.resolve()
        .then(() => {
            let swagger = loadSwaggerFile(ownServiceContext);
            let lambdasToCreate = getLambdasToCreate(stackName, swagger, ownServiceContext, dependenciesDeployContexts);
            let stackTags = deployPhaseCommon.getTags(ownServiceContext);
            let enrichedSwagger = enrichSwagger(stackName, swagger, ownServiceContext.accountConfig);

            return uploadDeployableArtifactsToS3(ownServiceContext, lambdasToCreate, serviceName, enrichedSwagger)
                .then(lambdasToCreate => {
                    return uploadSwaggerToS3(ownServiceContext, enrichedSwagger)
                        .then(swaggerS3ArtifactInfo => {
                            return getCompiledApiGatewayTemplate(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, lambdasToCreate, swaggerS3ArtifactInfo, stackTags);
                        });
                })
                .then(compiledTemplate => {
                    return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, serviceName, stackTags);
                })
                .then(deployedStack => {
                    let restApiUrl = apigatewayCommon.getRestApiUrl(deployedStack, ownServiceContext);
                    winston.info(`${serviceName} - Finished deploying API Gateway service. The service is available at ${restApiUrl}`);
                    return new DeployContext(ownServiceContext);
                });
        });
}
