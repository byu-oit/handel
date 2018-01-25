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
import * as winston from 'winston';
import * as cloudFormationCalls from '../../aws/cloudformation-calls';
import * as deletePhasesCommon from '../../common/delete-phases-common';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as handlebarsUtils from '../../common/handlebars-utils';
import * as s3DeployersCommon from '../../common/s3-deployers-common';
import {getTags} from '../../common/tagging-common';
import {DeployContext, PreDeployContext, ServiceConfig, ServiceContext, UnDeployContext} from '../../datatypes';
import {HandlebarsS3Template, S3ServiceConfig} from './config-types';
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

    const bucketName = cloudFormationCalls.getOutput('BucketName', cfStack);
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
            's3:DeleteObject'
        ],
        'Resource': [
            `arn:aws:s3:::${bucketName}/*`
        ]
    });

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
        tags: getTags(ownServiceContext),
        lifecycle_policy: lifecycleSection.getLifecycleConfig(ownServiceContext)
    };

    if (serviceParams.logging && serviceParams.logging === 'enabled') {
        handlebarsParams.loggingBucketName = loggingBucketName;
        handlebarsParams.logFilePrefix = s3DeployersCommon.getLogFilePrefix(ownServiceContext);
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/s3-template.yml`, handlebarsParams);
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
    const stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying bucket '${stackName}'`);

    const loggingBucketName = await s3DeployersCommon.createLoggingBucketIfNotExists(ownServiceContext.accountConfig);
    const compiledTemplate = await getCompiledS3Template(stackName, ownServiceContext, loggingBucketName!);
    const stackTags = getTags(ownServiceContext);
    const deployedStack = await deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying bucket '${stackName}'`);
    return getDeployContext(ownServiceContext, deployedStack);
}

export async function unDeploy(ownServiceContext: ServiceContext<S3ServiceConfig>): Promise<UnDeployContext> {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

// TODO - No events supported yet, but we will support some like Lambda
export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

export const consumedDeployOutputTypes = [];

export const supportsTagging = true;
