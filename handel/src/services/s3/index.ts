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
import { DeployContext, PreDeployContext, ProduceEventsContext, ServiceConfig, ServiceContext, UnDeployContext } from 'handel-extension-api';
import * as extensionSupport from 'handel-extension-support';
import * as winston from 'winston';
import * as s3Calls from '../../aws/s3-calls';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as s3DeployersCommon from '../../common/s3-deployers-common';
import { STDLIB_PREFIX } from '../stdlib';
import { HandlebarsS3Template, S3ServiceConfig, S3ServiceEventConsumer, S3ServiceEventFilterList } from './config-types';
import * as lifecycleSection from './lifecycles';

const SERVICE_NAME = 'S3';

interface VersioningParamMapping {
    [key: string]: string;
}

const VERSIONING_PARAM_MAPPING: VersioningParamMapping = {
    enabled: 'Enabled',
    disabled: 'Suspended'
};

function getDeployContext(serviceContext: ServiceContext<S3ServiceConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    const accountConfig = serviceContext.accountConfig;

    const bucketName = extensionSupport.awsCalls.cloudFormation.getOutput('BucketName', cfStack);
    const bucketArn = extensionSupport.awsCalls.cloudFormation.getOutput('BucketArn', cfStack);
    const deployContext = new DeployContext(serviceContext);

    // Env variables to inject into consuming services
    deployContext.addEnvironmentVariables(deployPhaseCommon.getInjectedEnvVarsFor(serviceContext, {
        BUCKET_NAME: bucketName,
        BUCKET_URL: `https://${bucketName}.s3.amazonaws.com/`,
        REGION_ENDPOINT: `s3-${accountConfig.region}.amazonaws.com`
    }));

    // Need two policies for accessing S3. The first allows you to list the contents of the bucket,
    // and the second allows you to modify objects in that bucket
    deployContext.policies.push({
        'Effect': 'Allow',
        'Action': [
            's3:ListBucket'
        ],
        'Resource': [
            `arn:aws:s3:::${bucketName}`
        ]
    });
    deployContext.policies.push({
        'Effect': 'Allow',
        'Action': [
            's3:PutObject',
            's3:GetObject',
            's3:DeleteObject',
            's3:GetObjectAcl',
            's3:PutObjectAcl',
            's3:DeleteObjectAcl'
        ],
        'Resource': [
            `arn:aws:s3:::${bucketName}/*`
        ]
    });

    // Output certain information for events
    deployContext.eventOutputs.bucketName = bucketName;
    deployContext.eventOutputs.bucketArn = bucketArn;
    deployContext.eventOutputs.principal = 's3.amazonaws.com';

    return deployContext;
}

function getCompiledS3Template(stackName: string, ownServiceContext: ServiceContext<S3ServiceConfig>, loggingBucketName: string) {
    const serviceParams = ownServiceContext.params;

    const bucketName = serviceParams.bucket_name || stackName;
    let versioningStatus = 'Suspended';
    if (serviceParams.versioning) {
        versioningStatus = VERSIONING_PARAM_MAPPING[serviceParams.versioning];
    }

    const handlebarsParams: HandlebarsS3Template = {
        bucketName: bucketName,
        bucketACL: serviceParams.bucket_acl,
        versioningStatus: versioningStatus,
        tags: extensionSupport.tagging.getTags(ownServiceContext),
        lifecycle_policy: lifecycleSection.getLifecycleConfig(ownServiceContext)
    };

    if (serviceParams.logging && serviceParams.logging === 'enabled') {
        handlebarsParams.loggingBucketName = loggingBucketName;
        handlebarsParams.logFilePrefix = s3DeployersCommon.getLogFilePrefix(ownServiceContext);
    }

    return extensionSupport.handlebars.compileTemplate(`${__dirname}/s3-template.yml`, handlebarsParams);
}

function getS3EventFilters(filterList: S3ServiceEventFilterList | undefined): AWS.S3.FilterRuleList {
    if (filterList) {
        return filterList.map(item => {
            return {
                Name: item.name,
                Value: item.value
            };
        });
    }
    else {
        return [];
    }
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<S3ServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors = [];
    const validAcls = ['AuthenticatedRead', 'AwsExecRead', 'BucketOwnerRead', 'BucketOwnerFullControl', 'LogDeliveryWrite', 'Private', 'PublicRead'];

    const params = serviceContext.params;
    if (params.versioning && (params.versioning !== 'enabled' && params.versioning !== 'disabled')) {
        errors.push(`${SERVICE_NAME} - 'versioning' parameter must be either 'enabled' or 'disabled'`);
    }
    if (params.bucket_acl && (!(validAcls.indexOf(params.bucket_acl) in validAcls))) {
        errors.push(`${SERVICE_NAME} - 'bucket_acl' parameter must be 'AuthenticatedRead', 'AwsExecRead', 'BucketOwnerRead', 'BucketOwnerFullControl', 'LogDeliveryWrite', 'Private' or 'PublicRead'`);
    }

    lifecycleSection.checkLifecycles(serviceContext, SERVICE_NAME, errors);

    return errors;
}

export async function deploy(ownServiceContext: ServiceContext<S3ServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = ownServiceContext.getResourceName();
    winston.info(`${SERVICE_NAME} - Deploying bucket '${stackName}'`);

    const loggingBucketName = await s3DeployersCommon.createLoggingBucketIfNotExists(ownServiceContext.accountConfig);
    const compiledTemplate = await getCompiledS3Template(stackName, ownServiceContext, loggingBucketName!);
    const stackTags = extensionSupport.tagging.getTags(ownServiceContext);
    const deployedStack = await extensionSupport.deployPhase.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME, 30, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying bucket '${stackName}'`);
    return getDeployContext(ownServiceContext, deployedStack);
}

export async function unDeploy(ownServiceContext: ServiceContext<S3ServiceConfig>): Promise<UnDeployContext> {
    return extensionSupport.deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
}

export async function produceEvents(ownServiceContext: ServiceContext<S3ServiceConfig>, ownDeployContext: DeployContext, eventConsumerConfig: S3ServiceEventConsumer, consumerServiceContext: ServiceContext<ServiceConfig>, consumerDeployContext: DeployContext): Promise<ProduceEventsContext> {
    winston.info(`${SERVICE_NAME} - Producing events from '${ownServiceContext.serviceName}' for consumer '${consumerServiceContext.serviceName}'`);
    // Add subscription to sns service
    const bucketName = ownDeployContext.eventOutputs.bucketName;
    const consumerServiceType = consumerServiceContext.serviceType;
    let consumerArn;
    if (consumerServiceType.matches(STDLIB_PREFIX, 'lambda')) {
        consumerArn = consumerDeployContext.eventOutputs.lambdaArn;
    }
    else if(consumerServiceType.matches(STDLIB_PREFIX, 'sns')) {
        consumerArn = consumerDeployContext.eventOutputs.topicArn;
    }
    else if(consumerServiceType.matches(STDLIB_PREFIX, 'sqs')) {
        consumerArn = consumerDeployContext.eventOutputs.queueArn;
    }
    else {
        throw new Error(`${SERVICE_NAME} - Unsupported event consumer type given: ${consumerServiceType}`);
    }
    const filters = getS3EventFilters(eventConsumerConfig.filters);

    const result = await s3Calls.configureBucketNotifications(bucketName, consumerServiceType.name, consumerArn, eventConsumerConfig.bucket_events, filters);
    winston.info(`${SERVICE_NAME} - Configured production of events from '${ownServiceContext.serviceName}' for consumer '${consumerServiceContext.serviceName}'`);
    return new ProduceEventsContext(ownServiceContext, consumerServiceContext);
}

export const producedEventsSupportedServices = [
    'lambda',
    'sns',
    'sqs'
];

export const producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

export const consumedDeployOutputTypes = [];

export const supportsTagging = true;
