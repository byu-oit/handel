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
    DeployContext,
    DeployOutputType,
    PreDeployContext,
    ProduceEventsContext,
    ServiceConfig,
    ServiceContext,
    ServiceDeployer,
    ServiceEventType,
    UnDeployContext
 } from 'handel-extension-api';
import { awsCalls, checkPhase, deletePhases, deployPhase, handlebars, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import * as s3Calls from '../../aws/s3-calls';
import * as s3DeployersCommon from '../../common/s3-deployers-common';
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

    const bucketName = awsCalls.cloudFormation.getOutput('BucketName', cfStack);
    const bucketArn = awsCalls.cloudFormation.getOutput('BucketArn', cfStack);
    if(!bucketName || !bucketArn) {
        throw new Error('Expected to receive bucket name and ARN from S3 service');
    }

    const deployContext = new DeployContext(serviceContext);

    // Env variables to inject into consuming services
    deployContext.addEnvironmentVariables({
        BUCKET_NAME: bucketName,
        BUCKET_ARN: bucketArn,
        BUCKET_URL: `https://${bucketName}.s3.amazonaws.com/`,
        REGION_ENDPOINT: `s3-${accountConfig.region}.amazonaws.com`
    });

    // Need two policies for accessing S3. The first allows you to list the contents of the bucket,
    // and the second allows you to modify objects in that bucket
    deployContext.policies.push({
        'Effect': 'Allow',
        'Action': [
            's3:ListBucket',
            's3:ListBucketVersions'
        ],
        'Resource': [
            `arn:aws:s3:::${bucketName}`
        ]
    });
    deployContext.policies.push({
        'Effect': 'Allow',
        'Action': [
            '*'
        ],
        'Resource': [
            `arn:aws:s3:::${bucketName}/*`
        ]
    });

    // Output certain information for events
    deployContext.eventOutputs = {
        resourceName: bucketName,
        resourceArn: bucketArn,
        resourcePrincipal: 's3.amazonaws.com',
        serviceEventType: ServiceEventType.S3
    };

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
        tags: tagging.getTags(ownServiceContext),
        lifecycle_policy: lifecycleSection.getLifecycleConfig(ownServiceContext)
    };

    if (serviceParams.logging && serviceParams.logging === 'enabled') {
        handlebarsParams.loggingBucketName = loggingBucketName;
        handlebarsParams.logFilePrefix = s3DeployersCommon.getLogFilePrefix(ownServiceContext);
    }

    return handlebars.compileTemplate(`${__dirname}/s3-template.yml`, handlebarsParams);
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

export class Service implements ServiceDeployer {
    public readonly providedEventType = ServiceEventType.S3;
    public readonly producedEventsSupportedTypes = [
        ServiceEventType.Lambda,
        ServiceEventType.SNS,
        ServiceEventType.SQS
    ];
    public readonly producedDeployOutputTypes = [
        DeployOutputType.EnvironmentVariables,
        DeployOutputType.Policies
    ];
    public readonly consumedDeployOutputTypes = [];
    public readonly supportsTagging = true;

    public check(serviceContext: ServiceContext<S3ServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
        const errors: string[] = checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
        lifecycleSection.checkLifecycles(serviceContext, errors);
        return errors;
    }

    public async deploy(ownServiceContext: ServiceContext<S3ServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
        const stackName = ownServiceContext.stackName();
        winston.info(`${SERVICE_NAME} - Deploying bucket '${stackName}'`);
        const loggingBucketName = await s3DeployersCommon.createLoggingBucketIfNotExists(ownServiceContext.accountConfig);
        const compiledTemplate = await getCompiledS3Template(stackName, ownServiceContext, loggingBucketName!);
        const stackTags = tagging.getTags(ownServiceContext);
        const deployedStack = await deployPhase.deployCloudFormationStack(ownServiceContext, stackName, compiledTemplate, [], true, 30, stackTags);
        winston.info(`${SERVICE_NAME} - Finished deploying bucket '${stackName}'`);
        return getDeployContext(ownServiceContext, deployedStack);
    }

    public async unDeploy(ownServiceContext: ServiceContext<S3ServiceConfig>): Promise<UnDeployContext> {
        return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
    }

    public async produceEvents(ownServiceContext: ServiceContext<S3ServiceConfig>, ownDeployContext: DeployContext, eventConsumerConfig: S3ServiceEventConsumer, consumerServiceContext: ServiceContext<ServiceConfig>, consumerDeployContext: DeployContext): Promise<ProduceEventsContext> {
        winston.info(`${SERVICE_NAME} - Producing events from '${ownServiceContext.serviceName}' for consumer '${consumerServiceContext.serviceName}'`);
        if(!ownDeployContext.eventOutputs || !consumerDeployContext.eventOutputs) {
            throw new Error(`${SERVICE_NAME} - Both the consumer and producer must return event outputs from their deploy`);
        }
        const bucketName = ownDeployContext.eventOutputs.resourceName;
        const consumerArn = consumerDeployContext.eventOutputs.resourceArn;
        if(!bucketName || !consumerArn) {
            throw new Error(`${SERVICE_NAME} - Expected bucket name and consumer ARN in deploy outputs`);
        }

        const consumerEventType = consumerDeployContext.eventOutputs.serviceEventType;
        if(!this.producedEventsSupportedTypes.includes(consumerEventType)) {
            throw new Error(`${SERVICE_NAME} - Unsupported event consumer type given: ${consumerEventType}`);
        }
        const filters = getS3EventFilters(eventConsumerConfig.filters);
        const result = await s3Calls.configureBucketNotifications(bucketName, consumerEventType, consumerArn, eventConsumerConfig.bucket_events, filters);
        winston.info(`${SERVICE_NAME} - Configured production of events from '${ownServiceContext.serviceName}' for consumer '${consumerServiceContext.serviceName}'`);
        return new ProduceEventsContext(ownServiceContext, consumerServiceContext);
    }
}
