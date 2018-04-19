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
import {ServiceType} from 'handel-extension-api';
import {
    AccountConfig,
    ConsumeEventsContext,
    DeployContext,
    EnvironmentVariables,
    PreDeployContext,
    ProduceEventsContext,
    ServiceConfig,
    ServiceContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import * as extensionSupport from 'handel-extension-support';
import * as _ from 'lodash';
import * as uuid from 'uuid';
import * as winston from 'winston';
import * as iamCalls from '../../aws/iam-calls';
import * as lambdaCalls from '../../aws/lambda-calls';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as iotDeployersCommon from '../../common/iot-deployers-common';
import * as lifecyclesCommon from '../../common/lifecycles-common';
import * as util from '../../common/util';
import { STDLIB_PREFIX } from '../stdlib';
import { DynamoDBLambdaConsumer, HandlebarsLambdaTemplate, LambdaServiceConfig } from './config-types';

const SERVICE_NAME = 'Lambda';

function getEnvVariablesToInject(serviceContext: ServiceContext<LambdaServiceConfig>, dependenciesDeployContexts: DeployContext[]): EnvironmentVariables {
    const serviceParams = serviceContext.params;
    let envVarsToInject = deployPhaseCommon.getEnvVarsFromDependencyDeployContexts(dependenciesDeployContexts);
    envVarsToInject = _.assign(envVarsToInject, deployPhaseCommon.getEnvVarsFromServiceContext(serviceContext));

    if (serviceParams.environment_variables) {
        for (const envVarName in serviceParams.environment_variables) {
            if (serviceParams.environment_variables.hasOwnProperty(envVarName)) {
                envVarsToInject[envVarName] = serviceParams.environment_variables[envVarName];
            }
        }
    }
    return envVarsToInject;
}

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
        tags: extensionSupport.tagging.getTags(ownServiceContext)
    };

    // Inject environment variables (if any)
    const envVarsToInject = getEnvVariablesToInject(ownServiceContext, dependenciesDeployContexts);
    if (Object.keys(envVarsToInject).length > 0) {
        handlebarsParams.environmentVariables = envVarsToInject;
    }

    if (serviceParams.vpc) {
        handlebarsParams.vpc = true;
        handlebarsParams.vpcSecurityGroupIds = securityGroups;
        handlebarsParams.vpcSubnetIds = accountConfig.private_subnets;
    }
    return extensionSupport.handlebars.compileTemplate(`${__dirname}/lambda-template.yml`, handlebarsParams);
}

function getDeployContext(serviceContext: ServiceContext<LambdaServiceConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    const deployContext = new DeployContext(serviceContext);
    const lambdaArn = extensionSupport.awsCalls.cloudFormation.getOutput('FunctionArn', cfStack);
    const lambdaName = extensionSupport.awsCalls.cloudFormation.getOutput('FunctionName', cfStack);

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
    deployContext.addEnvironmentVariables(deployPhaseCommon.getInjectedEnvVarsFor(serviceContext, {
        FUNCTION_ARN: lambdaArn,
        FUNCTION_NAME: lambdaName
    }));

    // Inject event outputs
    deployContext.eventOutputs.lambdaArn = lambdaArn;
    deployContext.eventOutputs.lambdaName = lambdaName;

    return deployContext;
}

async function uploadDeployableArtifactToS3(serviceContext: ServiceContext<LambdaServiceConfig>): Promise<AWS.S3.ManagedUpload.SendData> {
    const s3FileName = `lambda-deployable-${uuid()}.zip`;
    winston.info(`${SERVICE_NAME} - Uploading deployable artifact to S3: ${s3FileName}`);
    const pathToArtifact = serviceContext.params.path_to_code;
    const s3ArtifactInfo = await extensionSupport.deployPhase.uploadDeployableArtifactToHandelBucket(serviceContext, pathToArtifact, s3FileName);
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
        compiledTemplate = await extensionSupport.handlebars.compileTemplate(`${__dirname}/lambda-role-statements-vpc.handlebars`, handlebarsParams);
    } else {
        compiledTemplate = await extensionSupport.handlebars.compileTemplate(`${__dirname}/lambda-role-statements.handlebars`, handlebarsParams);
    }
    let ownPolicyStatements = JSON.parse(compiledTemplate);
    ownPolicyStatements = ownPolicyStatements.concat(deployPhaseCommon.getAppSecretsAccessPolicyStatements(serviceContext));

    return deployPhaseCommon.getAllPolicyStatementsForServiceRole(ownPolicyStatements, dependenciesDeployContexts);
}

async function addDynamoDBPermissions(ownServiceContext: ServiceContext<LambdaServiceConfig>, ownDeployContext: DeployContext, producerServiceContext: ServiceContext<ServiceConfig>, producerDeployContext: DeployContext) {
    const functionName = ownDeployContext.eventOutputs.lambdaName;

    // Get event outputs from the DynamoDB producer (we have to do all the work for Dynamo in this consume phase)
    const tableStreamArn = producerDeployContext.eventOutputs.tableStreamArn;
    const tableName = producerDeployContext.eventOutputs.tableName;
    const lambdaConsumers = producerDeployContext.eventOutputs.lambdaConsumers as DynamoDBLambdaConsumer[];

    // Attach the stream policy to the Lambda to allow for consuming events
    const policyStatementsToConsume = JSON.parse(util.readFileSync(`${__dirname}/lambda-dynamodb-stream-role-statements.json`));
    policyStatementsToConsume[0].Resource = [];
    const tableStreamGeneralArn = tableStreamArn.substring(0, tableStreamArn.lastIndexOf('/') + 1).concat('*');
    policyStatementsToConsume[0].Resource.push(tableStreamGeneralArn);
    await iamCalls.attachStreamPolicy(ownServiceContext.getResourceName(), policyStatementsToConsume, ownServiceContext.accountConfig);
    winston.info(`${SERVICE_NAME} - Allowed consuming events from ${producerServiceContext.serviceName} for ${ownServiceContext.serviceName}`);

    // Add the event source mapping to the Lambda
    // let lambdaConsumer: DynamoDBLambdaConsumer;
    for(const consumer of lambdaConsumers) {
        if (consumer.serviceName === ownServiceContext.serviceName) {
            await lambdaCalls.addLambdaEventSourceMapping(functionName, tableName, tableStreamArn, consumer.batchSize);
            return new ConsumeEventsContext(ownServiceContext, producerServiceContext);
        }
    }
    // Didn't find the consumer, so throw an error
    throw Error('Consumer serviceName not found in dynamodb event_consumers.');
}

async function addOtherPermissions(producerServiceType: ServiceType, producerServiceContext: ServiceContext<ServiceConfig>, producerDeployContext: DeployContext, ownDeployContext: DeployContext, ownServiceContext: ServiceContext<LambdaServiceConfig>) {
    const functionName = ownDeployContext.eventOutputs.lambdaName;
    let principal;
    let sourceArn;
    if (producerServiceType.matches(STDLIB_PREFIX, 'sns')) {
        principal = producerDeployContext.eventOutputs.principal;
        sourceArn = producerDeployContext.eventOutputs.topicArn;
    }
    else if (producerServiceType.matches(STDLIB_PREFIX, 'cloudwatchevent')) {
        principal = producerDeployContext.eventOutputs.principal;
        sourceArn = producerDeployContext.eventOutputs.eventRuleArn;
    }
    else if (producerServiceType.matches(STDLIB_PREFIX, 'alexaskillkit')) {
        principal = producerDeployContext.eventOutputs.principal;
    }
    else if (producerServiceType.matches(STDLIB_PREFIX, 'iot')) {
        principal = producerDeployContext.eventOutputs.principal;
        sourceArn = iotDeployersCommon.getTopicRuleArn(producerDeployContext.eventOutputs.topicRuleArnPrefix, ownServiceContext.serviceName);
    }
    else if (producerServiceType.matches(STDLIB_PREFIX, 's3')) {
        principal = producerDeployContext.eventOutputs.principal;
        sourceArn = producerDeployContext.eventOutputs.bucketArn;
    }
    else {
        throw new Error(`${SERVICE_NAME} - Unsupported event producer type given: ${producerServiceType}`);
    }

    await lambdaCalls.addLambdaPermissionIfNotExists(functionName, principal, sourceArn);
    winston.info(`${SERVICE_NAME} - Allowed consuming events from ${producerServiceContext.serviceName} for ${ownServiceContext.serviceName}`);
    return new ConsumeEventsContext(ownServiceContext, producerServiceContext);
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<LambdaServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors: string[] = [];

    const serviceParams = serviceContext.params;
    if (!serviceParams.path_to_code) {
        errors.push(`${SERVICE_NAME} - The 'path_to_code' parameter is required`);
    }
    if (!serviceParams.handler) {
        errors.push(`${SERVICE_NAME} - The 'handler' parameter is required`);
    }
    if (!serviceParams.runtime) {
        errors.push(`${SERVICE_NAME} - The 'runtime' parameter is required`);
    }
    if (dependenciesServiceContexts) {
        dependenciesServiceContexts.forEach((dependencyServiceContext) => {
            if (dependencyServiceContext.serviceInfo.producedDeployOutputTypes.indexOf('securityGroups') !== -1 && !serviceParams.vpc) {
                errors.push(`${SERVICE_NAME} - The 'vpc' parameter is required and must be true when declaring dependencies of type ${dependencyServiceContext.serviceType}`);
            }
        });
    }

    return errors;
}

export async function preDeploy(serviceContext: ServiceContext<LambdaServiceConfig>): Promise<PreDeployContext> {
    if (serviceContext.params.vpc) {
        return extensionSupport.preDeployPhase.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
    } else {
        return lifecyclesCommon.preDeployNotRequired(serviceContext);
    }
}

export async function deploy(ownServiceContext: ServiceContext<LambdaServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = ownServiceContext.getResourceName();
    winston.info(`${SERVICE_NAME} - Executing Deploy on '${stackName}'`);
    const securityGroups: string[] = [];
    if (ownPreDeployContext.securityGroups) {
        ownPreDeployContext.securityGroups.forEach((secGroup) => {
            securityGroups.push(secGroup.GroupId!);
        });
    }
    const s3ArtifactInfo = await uploadDeployableArtifactToS3(ownServiceContext);
    const compiledLambdaTemplate = await getCompiledLambdaTemplate(stackName, ownServiceContext, dependenciesDeployContexts, s3ArtifactInfo, securityGroups);
    const stackTags = extensionSupport.tagging.getTags(ownServiceContext);
    const deployedStack = await extensionSupport.deployPhase.deployCloudFormationStack(stackName, compiledLambdaTemplate, [], true, SERVICE_NAME, 30, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying '${stackName}'`);
    return getDeployContext(ownServiceContext, deployedStack);
}

export async function consumeEvents(ownServiceContext: ServiceContext<LambdaServiceConfig>, ownDeployContext: DeployContext, producerServiceContext: ServiceContext<ServiceConfig>, producerDeployContext: DeployContext): Promise<ProduceEventsContext> {
    winston.info(`${SERVICE_NAME} - Consuming events from service '${producerServiceContext.serviceName}' for service '${ownServiceContext.serviceName}'`);
    const producerType = producerServiceContext.serviceType;
    if (producerType.matches(STDLIB_PREFIX, 'dynamodb')) {
        return addDynamoDBPermissions(ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext);
    } else {
        return addOtherPermissions(producerType, producerServiceContext, producerDeployContext, ownDeployContext, ownServiceContext);
    }
}

export async function unPreDeploy(ownServiceContext: ServiceContext<LambdaServiceConfig>): Promise<UnPreDeployContext> {
    if (ownServiceContext.params.vpc) {
        return extensionSupport.deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
    } else {
        return lifecyclesCommon.unPreDeployNotRequired(ownServiceContext);
    }
}

export async function unDeploy(ownServiceContext: ServiceContext<LambdaServiceConfig>): Promise<UnDeployContext> {
    await iamCalls.detachPoliciesFromRole(ownServiceContext.getResourceName());
    return extensionSupport.deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = [
    'policies'
];

export const consumedDeployOutputTypes = [
    'environmentVariables',
    'policies',
    'securityGroups'
];

export const supportsTagging = true;
