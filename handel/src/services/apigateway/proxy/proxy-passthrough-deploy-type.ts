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
import { S3 } from 'aws-sdk';
import { DeployContext, PreDeployContext, ServiceConfig, ServiceContext } from 'handel-extension-api';
import { awsCalls, deployPhase, handlebars, tagging } from 'handel-extension-support';
import * as uuid from 'uuid';
import * as winston from 'winston';
import * as apigatewayCommon from '../common';
import { APIGatewayConfig, WarmupConfig } from '../config-types';

async function uploadDeployableArtifactToS3(serviceContext: ServiceContext<APIGatewayConfig>, serviceName: string): Promise<S3.ManagedUpload.SendData> {
    if(!serviceContext.params.proxy) {
        throw new Error('Expected proxy passthrough configuration to be present');
    }
    const s3FileName = `apigateway-deployable-${uuid()}.zip`;
    winston.info(`${serviceName} - Uploading deployable artifact to S3: ${s3FileName}`);
    const pathToArtifact = serviceContext.params.proxy.path_to_code;
    const s3ArtifactInfo = await deployPhase.uploadDeployableArtifactToHandelBucket(serviceContext, pathToArtifact, s3FileName);
    winston.info(`${serviceName} - Uploaded deployable artifact to S3: ${s3FileName}`);
    return s3ArtifactInfo;
}

async function getCompiledApiGatewayTemplate(stackName: string, ownServiceContext: ServiceContext<APIGatewayConfig>, dependenciesDeployContexts: DeployContext[], s3ObjectInfo: AWS.S3.ManagedUpload.SendData, ownPreDeployContext: PreDeployContext) {
    const serviceParams = ownServiceContext.params;
    if(!serviceParams.proxy) {
        throw new Error('Expected proxy passthrough configuration to be present');
    }
    const accountConfig = ownServiceContext.accountConfig;

    const stageName = ownServiceContext.environmentName;

    const handlebarsParams: any = {
        description: serviceParams.description || `Handel-created API for '${stackName}'`,
        stageName,
        s3Bucket: s3ObjectInfo.Bucket,
        s3Key: s3ObjectInfo.Key,
        apiName: stackName,
        provisionedMemory: serviceParams.proxy.memory || '128',
        handlerFunction: serviceParams.proxy.handler,
        functionTimeout: (serviceParams.proxy.timeout || '3').toString(),
        lambdaRuntime: serviceParams.proxy.runtime,
        policyStatements: apigatewayCommon.getPolicyStatementsForLambdaRole(ownServiceContext, dependenciesDeployContexts),
        tags: tagging.getTags(ownServiceContext)
    };

    if (accountConfig.permissions_boundary) {
        handlebarsParams.permissionsBoundary = accountConfig.permissions_boundary
    }

    // Add binary media types if specified
    const binaryMediaTypes = serviceParams.binary_media_types;
    if (binaryMediaTypes) {
        handlebarsParams.binaryMediaTypes = [];
        for (const type of binaryMediaTypes) {
            handlebarsParams.binaryMediaTypes.push(type.replace('/', '~1'));
        }
    }

    // Add env vars
    if (serviceParams.proxy) {
        handlebarsParams.environment_variables = deployPhase.getEnvVarsForDeployedService(ownServiceContext, dependenciesDeployContexts, serviceParams.proxy.environment_variables);
    }
    else {
        handlebarsParams.environment_variables = deployPhase.getEnvVarsForDeployedService(ownServiceContext, dependenciesDeployContexts, serviceParams.environment_variables);
    }

    const vpc = serviceParams.vpc;
    if (vpc) {
        handlebarsParams.vpc = true;
        handlebarsParams.vpcSecurityGroupIds = apigatewayCommon.getSecurityGroups(ownPreDeployContext);
        handlebarsParams.vpcSubnetIds = accountConfig.private_subnets;
    }

    if (serviceParams.custom_domains) {
        handlebarsParams.customDomains = await apigatewayCommon.getCustomDomainHandlebarsParams(ownServiceContext, serviceParams.custom_domains);
    }

    const warmup = serviceParams.proxy.warmup;
    if (warmup) {
        handlebarsParams.warmup = apigatewayCommon.getWarmupTemplateParameters(warmup, ownServiceContext, 'ServerlessRestApi');
    }

    return handlebars.compileTemplate(`${__dirname}/apigateway-proxy-template.yml`, handlebarsParams);
}

export function check(serviceContext: ServiceContext<APIGatewayConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>, serviceName: string): string[] {
    const checkErrors: string[] = [];
    const proxy = serviceContext.params.proxy!;
    if (proxy.warmup) {
        checkErrors.push(...apigatewayCommon.checkWarmupConfig(proxy.warmup));
    }
    return checkErrors;
}

export async function deploy(stackName: string, ownServiceContext: ServiceContext<APIGatewayConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[], serviceName: string) {
    const s3ObjectInfo = await uploadDeployableArtifactToS3(ownServiceContext, serviceName);
    const compiledTemplate = await getCompiledApiGatewayTemplate(stackName, ownServiceContext, dependenciesDeployContexts, s3ObjectInfo, ownPreDeployContext);
    const stackTags = tagging.getTags(ownServiceContext);
    const deployedStack = await deployPhase.deployCloudFormationStack(ownServiceContext, stackName, compiledTemplate, [], true, 30, stackTags);
    const restApiUrl = apigatewayCommon.getRestApiUrl(deployedStack, ownServiceContext);
    await maybePreWarmLambda(ownServiceContext, deployedStack);
    winston.info(`${serviceName} - Finished deploying API Gateway service. The service is available at ${restApiUrl}`);
    return new DeployContext(ownServiceContext);
}

async function maybePreWarmLambda(serviceContext: ServiceContext<APIGatewayConfig>, deployedStack: AWS.CloudFormation.Stack): Promise<void> {
    if(!serviceContext.params.proxy) {
        throw new Error('Expected proxy passthrough configuration to be present');
    }
    const warmup: WarmupConfig | undefined = serviceContext.params.proxy.warmup;

    if (!warmup) {
        return;
    }

    const lambdaName = awsCalls.cloudFormation.getOutput('LambdaArn', deployedStack)!;
    const restApiId = awsCalls.cloudFormation.getOutput('RestApiId', deployedStack)!;

    await apigatewayCommon.preWarmLambda(serviceContext, warmup, lambdaName, restApiId);
}
