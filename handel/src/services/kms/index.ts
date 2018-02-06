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
import {getTags} from '../../common/tagging-common';
import {DeployContext, PreDeployContext, ServiceConfig, ServiceContext, UnDeployContext} from '../../datatypes';
import {KmsServiceConfig} from './config-types';

const SERVICE_NAME = 'KMS';

function getDeployContext(serviceContext: ServiceContext<KmsServiceConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    const keyId = cloudFormationCalls.getOutput('KeyId', cfStack);
    const keyArn = cloudFormationCalls.getOutput('KeyArn', cfStack);
    const aliasName = cloudFormationCalls.getOutput('AliasName', cfStack);
    const aliasArn = cloudFormationCalls.getOutput('AliasArn', cfStack);

    const deployContext = new DeployContext(serviceContext);

    deployContext.addEnvironmentVariables(deployPhaseCommon.getInjectedEnvVarsFor(serviceContext, {
        'KEY_ID': keyId,
        'KEY_ARN': keyArn,
        'ALIAS_NAME': aliasName,
        'ALIAS_ARN': aliasArn
    }));

    // Set up key use policies
    deployContext.policies.push({
        'Effect': 'Allow',
        'Action': [
            'kms:DescribeKey',
            'kms:Encrypt',
            'kms:Decrypt',
            'kms:GenerateDataKey',
            'kms:GenerateDataKeyWithoutPlaintext',
            'kms:ReEncryptFrom',
            'kms:ReEncryptTo',
        ],
        'Resource': [
            keyArn
        ]
    });

    return deployContext;
}

async function getCompiledTemplate(ownServiceContext: ServiceContext<KmsServiceConfig>): Promise<string> {
    const serviceParams = ownServiceContext.params;

    const autoRotate = serviceParams.hasOwnProperty('auto_rotate') ? !!serviceParams.auto_rotate : true;

    const handlebarsParams = {
        autoRotate: autoRotate,
        alias: serviceParams.alias || getDefaultAlias(ownServiceContext)
    };

    return handlebarsUtils.compileTemplate(`${__dirname}/kms-template.yml`, handlebarsParams);
}

function getDefaultAlias(serviceContext: ServiceContext<KmsServiceConfig>): string {
    return `${serviceContext.appName}/${serviceContext.environmentName}/${serviceContext.serviceName}`;
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<KmsServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors = [];

    const params = serviceContext.params;

    if (params.alias) {
        const alias = params.alias;
        if (alias.startsWith('AWS')) {
            errors.push('\'alias\' parameter must not begin with \'AWS\'');
        }
        if (!alias.match(/^[-\/_a-z0-9]+$/i)) {
            errors.push('\'alias\' parameter must only contain alphanumeric characters, dashes (\'-\'), underscores (\'_\'), or slashes (\'/\')');
        }
    }

    return errors.map(it => `${SERVICE_NAME} - ${it}`);
}

export async function deploy(ownServiceContext: ServiceContext<KmsServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying KMS Key ${stackName}`);

    const compiledTemplate = await getCompiledTemplate(ownServiceContext);
    const stackTags = getTags(ownServiceContext);
    const deployedStack = await deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying KMS Key ${stackName}`);
    return getDeployContext(ownServiceContext, deployedStack);
}

export async function unDeploy(ownServiceContext: ServiceContext<KmsServiceConfig>): Promise<UnDeployContext> {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

export const consumedDeployOutputTypes = [];

export const supportsTagging = true;
