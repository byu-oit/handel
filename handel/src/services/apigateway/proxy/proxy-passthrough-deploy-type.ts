/*
 * Copyright 2018 Brigham Young University
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
import * as uuid from 'uuid';
import * as winston from 'winston';
import * as deployPhaseCommon from '../../../common/deploy-phase-common';
import * as handlebarsUtils from '../../../common/handlebars-utils';
import {getTags} from '../../../common/tagging-common';
import {DeployContext, PreDeployContext, ServiceConfig, ServiceContext} from '../../../datatypes';
import * as apigatewayCommon from '../common';
import {APIGatewayConfig} from '../config-types';

async function uploadDeployableArtifactToS3(serviceContext: ServiceContext<APIGatewayConfig>, serviceName: string): Promise<AWS.S3.ManagedUpload.SendData> {
    const s3FileName = `apigateway-deployable-${uuid()}.zip`;
    winston.info(`${serviceName} - Uploading deployable artifact to S3: ${s3FileName}`);
    const pathToArtifact = getParam(serviceContext.params, 'path_to_code', 'path_to_code', undefined);
    const s3ArtifactInfo = await deployPhaseCommon.uploadDeployableArtifactToHandelBucket(serviceContext, pathToArtifact, s3FileName);
    winston.info(`${serviceName} - Uploaded deployable artifact to S3: ${s3FileName}`);
    return s3ArtifactInfo;
}

async function getCompiledApiGatewayTemplate(stackName: string, ownServiceContext: ServiceContext<APIGatewayConfig>, dependenciesDeployContexts: DeployContext[], s3ObjectInfo: AWS.S3.ManagedUpload.SendData, ownPreDeployContext: PreDeployContext) {
    const serviceParams = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;

    const handlebarsParams: any = {
        description: serviceParams.description || `Handel-created API for '${stackName}'`,
        stageName: ownServiceContext.environmentName,
        s3Bucket: s3ObjectInfo.Bucket,
        s3Key: s3ObjectInfo.Key,
        apiName: stackName,
        provisionedMemory: getParam(serviceParams, 'provisioned_memory', 'memory', '128'),
        handlerFunction: getParam(serviceParams, 'handler_function', 'handler', undefined),
        functionTimeout: getParam(serviceParams, 'function_timeout', 'timeout', '3').toString(),
        lambdaRuntime: getParam(serviceParams, 'lambda_runtime', 'runtime', undefined),
        policyStatements: apigatewayCommon.getPolicyStatementsForLambdaRole(ownServiceContext, dependenciesDeployContexts),
        tags: getTags(ownServiceContext)
    };

    // Add binary media types if specified
    const binaryMediaTypes = getParam(serviceParams, 'binary_media_types', undefined, undefined);
    if (binaryMediaTypes) {
        handlebarsParams.binaryMediaTypes = [];
        for (const type of binaryMediaTypes) {
            handlebarsParams.binaryMediaTypes.push(type.replace('/', '~1'));
        }
    }

    // Add env vars
    if (serviceParams.proxy) {
        handlebarsParams.environment_variables = apigatewayCommon.getEnvVarsForService(serviceParams.proxy.environment_variables, ownServiceContext, dependenciesDeployContexts);
    }
    else {
        handlebarsParams.environment_variables = apigatewayCommon.getEnvVarsForService(serviceParams.environment_variables, ownServiceContext, dependenciesDeployContexts);
    }

    const vpc = getParam(serviceParams, 'vpc', undefined, undefined);
    if (vpc) {
        handlebarsParams.vpc = true;
        handlebarsParams.vpcSecurityGroupIds = apigatewayCommon.getSecurityGroups(ownPreDeployContext);
        handlebarsParams.vpcSubnetIds = accountConfig.private_subnets;
    }

    if (serviceParams.custom_domains) {
        handlebarsParams.customDomains = await apigatewayCommon.getCustomDomainHandlebarsParams(ownServiceContext, serviceParams.custom_domains);
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/apigateway-proxy-template.yml`, handlebarsParams);
}

function checkForParam(params: any, oldParamName: string, newParamName: string, checkErrors: string[]) {
    if (!params[oldParamName]) {
        if (!params.proxy || !params.proxy[newParamName]) {
            checkErrors.push(`'${newParamName}' parameter is required`);
        }
    }
    else {
        winston.warn(`The '${oldParamName}' parameter is deprecated. Use 'proxy.${newParamName}' instead.`);
    }
}

function getParam(params: any, oldParamName: string, newParamName: string | undefined, defaultValue: string | number | undefined) {
    if (params[oldParamName]) {
        return params[oldParamName];
    }
    else if (params.proxy && params.proxy[newParamName!]) {
        return params.proxy[newParamName!];
    }
    else {
        return defaultValue;
    }
}

export function check(serviceContext: ServiceContext<APIGatewayConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>, serviceName: string): string[] {
    const checkErrors: string[] = [];

    const params = serviceContext.params;
    checkForParam(params, 'path_to_code', 'path_to_code', checkErrors);
    checkForParam(params, 'lambda_runtime', 'runtime', checkErrors);
    checkForParam(params, 'handler_function', 'handler', checkErrors);

    return checkErrors;
}

export async function deploy(stackName: string, ownServiceContext: ServiceContext<APIGatewayConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[], serviceName: string) {
    const s3ObjectInfo = await uploadDeployableArtifactToS3(ownServiceContext, serviceName);
    const compiledTemplate = await getCompiledApiGatewayTemplate(stackName, ownServiceContext, dependenciesDeployContexts, s3ObjectInfo, ownPreDeployContext);
    const stackTags = getTags(ownServiceContext);
    const deployedStack = await deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, serviceName, 30, stackTags);
    const restApiUrl = apigatewayCommon.getRestApiUrl(deployedStack, ownServiceContext);
    winston.info(`${serviceName} - Finished deploying API Gateway service. The service is available at ${restApiUrl}`);
    return new DeployContext(ownServiceContext);
}
