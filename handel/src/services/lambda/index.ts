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
import {
    AccountConfig,
    ConsumeEventsContext,
    DeployContext,
    DeployOutputType,
    PreDeployContext,
    ProduceEventsContext,
    ServiceConfig,
    ServiceContext,
    ServiceDeployer,
    ServiceEventConsumer,
    ServiceEventType,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import {
    awsCalls,
    checkPhase,
    deletePhases,
    deployPhase,
    handlebars,
    preDeployPhase,
    tagging
} from 'handel-extension-support';

import * as uuid from 'uuid';
import * as winston from 'winston';
import * as lambdaCalls from '../../aws/lambda-calls';
import * as lifecyclesCommon from '../../common/lifecycles-common';
import { HandlebarsLambdaTemplate, LambdaEventSourceConfig, LambdaServiceConfig } from './config-types';
import * as lambdaEvents from './events';

const SERVICE_NAME = 'Lambda';

async function getCompiledLambdaTemplate(stackName: string, ownServiceContext: ServiceContext<LambdaServiceConfig>, dependenciesDeployContexts: DeployContext[], s3ArtifactInfo: AWS.S3.ManagedUpload.SendData, securityGroups: string[]): Promise<string> {
    const serviceParams = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;

    const policyStatements = await getPolicyStatementsForLambdaRole(ownServiceContext, dependenciesDeployContexts, stackName);

    const description = serviceParams.description || 'Handel-created function ' + stackName;
    const memorySize = serviceParams.memory || 128;
    const timeout = serviceParams.timeout || 3;
    const handlebarsParams: HandlebarsLambdaTemplate = {
        description: description,
        functionName: stackName,
        s3ArtifactBucket: s3ArtifactInfo.Bucket,
        s3ArtifactKey: s3ArtifactInfo.Key,
        handler: serviceParams.handler,
        runtime: serviceParams.runtime,
        memorySize: memorySize,
        timeout: timeout,
        policyStatements,
        tags: tagging.getTags(ownServiceContext)
    };

    // Inject environment variables (if any)
    const envVarsToInject = deployPhase.getEnvVarsForDeployedService(ownServiceContext, dependenciesDeployContexts, serviceParams.environment_variables);
    if (Object.keys(envVarsToInject).length > 0) {
        handlebarsParams.environmentVariables = envVarsToInject;
    }

    if (serviceParams.vpc) {
        handlebarsParams.vpc = true;
        handlebarsParams.vpcSecurityGroupIds = securityGroups;
        handlebarsParams.vpcSubnetIds = accountConfig.private_subnets;
    }
    return handlebars.compileTemplate(`${__dirname}/lambda-template.yml`, handlebarsParams);
}

function getDeployContext(serviceContext: ServiceContext<LambdaServiceConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    const deployContext = new DeployContext(serviceContext);
    const lambdaArn = awsCalls.cloudFormation.getOutput('FunctionArn', cfStack);
    const lambdaName = awsCalls.cloudFormation.getOutput('FunctionName', cfStack);
    if(!lambdaArn || !lambdaName) {
        throw new Error('Expected to receive lambda name and lambda ARN from lambda service');
    }

    // Output policy for consuming this Lambda
    deployContext.policies.push({
        'Effect': 'Allow',
        'Action': [
            'lambda:InvokeFunction',
            'lambda:InvokeAsync'
        ],
        'Resource': [
            lambdaArn
        ]
    });

    // Inject env vars
    deployContext.addEnvironmentVariables({
        FUNCTION_ARN: lambdaArn,
        FUNCTION_NAME: lambdaName
    });

    // Inject event outputs
    deployContext.eventOutputs = {
        resourceArn: lambdaArn,
        resourceName: lambdaName,
        resourcePrincipal: 'lambda.amazonaws.com',
        serviceEventType: ServiceEventType.Lambda
    };

    return deployContext;
}

async function uploadDeployableArtifactToS3(serviceContext: ServiceContext<LambdaServiceConfig>): Promise<AWS.S3.ManagedUpload.SendData> {
    const s3FileName = `lambda-deployable-${uuid()}.zip`;
    winston.info(`${SERVICE_NAME} - Uploading deployable artifact to S3: ${s3FileName}`);
    const pathToArtifact = serviceContext.params.path_to_code;
    const s3ArtifactInfo = await deployPhase.uploadDeployableArtifactToHandelBucket(serviceContext, pathToArtifact, s3FileName);
    winston.info(`${SERVICE_NAME} - Uploaded deployable artifact to S3: ${s3FileName}`);
    return s3ArtifactInfo;
}

// We have this function to pre-construct an ARN before the service is deployed
// This seems a bit odd, but we need to inject the ARN of the service to be able to invoke itself.
function getLambdaArn(accountConfig: AccountConfig, stackName: string) {
    return `arn:aws:lambda:${accountConfig.region}:${accountConfig.account_id}:function:${stackName}`;
}

async function getPolicyStatementsForLambdaRole(serviceContext: ServiceContext<LambdaServiceConfig>, dependenciesDeployContexts: DeployContext[], stackName: string): Promise<any[]> {
    const handlebarsParams = {
        ownLambdaArn: getLambdaArn(serviceContext.accountConfig, stackName)
    };
    let compiledTemplate;
    if (serviceContext.params.vpc) {
        compiledTemplate = await handlebars.compileTemplate(`${__dirname}/lambda-role-statements-vpc.handlebars`, handlebarsParams);
    } else {
        compiledTemplate = await handlebars.compileTemplate(`${__dirname}/lambda-role-statements.handlebars`, handlebarsParams);
    }
    const ownPolicyStatements = JSON.parse(compiledTemplate);

    return deployPhase.getAllPolicyStatementsForServiceRole(serviceContext, ownPolicyStatements, dependenciesDeployContexts, true, true);
}

export class Service implements ServiceDeployer {
    public readonly producedDeployOutputTypes = [
        DeployOutputType.Policies
    ];
    public readonly consumedDeployOutputTypes = [
        DeployOutputType.EnvironmentVariables,
        DeployOutputType.Policies,
        DeployOutputType.SecurityGroups
    ];
    public readonly providedEventType = ServiceEventType.Lambda;
    public readonly producedEventsSupportedTypes = [];
    public readonly supportsTagging = true;

    public check(serviceContext: ServiceContext<LambdaServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
        const errors: string[] = checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
        const serviceParams = serviceContext.params;
        if (dependenciesServiceContexts) {
            dependenciesServiceContexts.forEach((dependencyServiceContext) => {
                if (dependencyServiceContext.serviceInfo.producedDeployOutputTypes.indexOf('securityGroups') !== -1 && !serviceParams.vpc) {
                    errors.push(`The 'vpc' parameter is required and must be true when declaring dependencies of type ${dependencyServiceContext.serviceType}`);
                }
            });
        }
        return errors;
    }

    public async preDeploy(serviceContext: ServiceContext<LambdaServiceConfig>): Promise<PreDeployContext> {
        if (serviceContext.params.vpc) {
            return preDeployPhase.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
        } else {
            return lifecyclesCommon.preDeployNotRequired(serviceContext);
        }
    }

    public async getPreDeployContext(serviceContext: ServiceContext<LambdaServiceConfig>): Promise<PreDeployContext> {
        if (serviceContext.params.vpc) {
            return preDeployPhase.getSecurityGroup(serviceContext);
        } else {
            return lifecyclesCommon.preDeployNotRequired(serviceContext);
        }
    }

    public async deploy(ownServiceContext: ServiceContext<LambdaServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
        const stackName = ownServiceContext.stackName();
        winston.info(`${SERVICE_NAME} - Executing Deploy on '${stackName}'`);
        const securityGroups: string[] = [];
        if (ownPreDeployContext.securityGroups) {
            ownPreDeployContext.securityGroups.forEach((secGroup) => {
                securityGroups.push(secGroup.GroupId!);
            });
        }
        const s3ArtifactInfo = await uploadDeployableArtifactToS3(ownServiceContext);
        const compiledLambdaTemplate = await getCompiledLambdaTemplate(stackName, ownServiceContext, dependenciesDeployContexts, s3ArtifactInfo, securityGroups);
        const stackTags = tagging.getTags(ownServiceContext);
        const deployedStack = await deployPhase.deployCloudFormationStack(ownServiceContext, stackName, compiledLambdaTemplate, [], true, 30, stackTags);
        winston.info(`${SERVICE_NAME} - Finished deploying '${stackName}'`);
        return getDeployContext(ownServiceContext, deployedStack);
    }

    public async consumeEvents(ownServiceContext: ServiceContext<LambdaServiceConfig>, ownDeployContext: DeployContext, eventConsumerConfig: ServiceEventConsumer, producerServiceContext: ServiceContext<ServiceConfig>, producerDeployContext: DeployContext): Promise<ProduceEventsContext> {
        winston.info(`${SERVICE_NAME} - Consuming events from service '${producerServiceContext.serviceName}' for service '${ownServiceContext.serviceName}'`);
        if(!producerDeployContext.eventOutputs) {
            throw new Error(`${SERVICE_NAME} - The producer must return event outputs from their deploy`);
        }
        const consumerServiceType = producerDeployContext.eventOutputs.serviceEventType;
        if (consumerServiceType === ServiceEventType.DynamoDB) {
            await lambdaEvents.consumeDynamoEvents(ownServiceContext, ownDeployContext, eventConsumerConfig as LambdaEventSourceConfig, producerServiceContext, producerDeployContext);
        }
        else if (consumerServiceType === ServiceEventType.SQS) {
            await lambdaEvents.consumeSqsEvents(ownServiceContext, ownDeployContext, eventConsumerConfig as LambdaEventSourceConfig, producerServiceContext, producerDeployContext);
        }
        else {
            await lambdaEvents.addProducePermissions(ownServiceContext, ownDeployContext, producerDeployContext);
        }
        winston.info(`${SERVICE_NAME} - Allowed consuming events from ${producerServiceContext.serviceName} for ${ownServiceContext.serviceName}`);
        return new ConsumeEventsContext(ownServiceContext, producerServiceContext);
    }

    public async unPreDeploy(ownServiceContext: ServiceContext<LambdaServiceConfig>): Promise<UnPreDeployContext> {
        if (ownServiceContext.params.vpc) {
            return deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
        } else {
            return lifecyclesCommon.unPreDeployNotRequired(ownServiceContext);
        }
    }

    public async unDeploy(ownServiceContext: ServiceContext<LambdaServiceConfig>): Promise<UnDeployContext> {
        await lambdaCalls.deleteAllEventSourceMappings(ownServiceContext.stackName()); // Delete all event source mappings (if any)
        await lambdaEvents.deleteEventSourcePolicies(ownServiceContext.stackName()); // Detach and delete policies for event source mappings (if any)
        return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
    }
}
