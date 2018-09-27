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
    ServiceConfig,
    ServiceContext,
    ServiceDeployer,
    UnDeployContext
} from 'handel-extension-api';
import { awsCalls, checkPhase, deletePhases, deployPhase, handlebars, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import {KmsServiceConfig} from './config-types';

const SERVICE_NAME = 'KMS';

function getDeployContext(serviceContext: ServiceContext<KmsServiceConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    const keyId = awsCalls.cloudFormation.getOutput('KeyId', cfStack);
    const keyArn = awsCalls.cloudFormation.getOutput('KeyArn', cfStack);
    const aliasName = awsCalls.cloudFormation.getOutput('AliasName', cfStack);
    const aliasArn = awsCalls.cloudFormation.getOutput('AliasArn', cfStack);
    if(!keyId || !keyArn || !aliasName || !aliasArn) {
        throw new Error('Expected to receive key ID, key ARN, alias name, and alias ARN from KMS service');
    }

    const deployContext = new DeployContext(serviceContext);

    deployContext.addEnvironmentVariables({
        'KEY_ID': keyId,
        'KEY_ARN': keyArn,
        'ALIAS_NAME': aliasName,
        'ALIAS_ARN': aliasArn
    });

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

    return handlebars.compileTemplate(`${__dirname}/kms-template.yml`, handlebarsParams);
}

function getDefaultAlias(serviceContext: ServiceContext<KmsServiceConfig>): string {
    return `${serviceContext.appName}/${serviceContext.environmentName}/${serviceContext.serviceName}`;
}

export class Service implements ServiceDeployer {
    public readonly producedDeployOutputTypes = [
        DeployOutputType.EnvironmentVariables,
        DeployOutputType.Policies
    ];
    public readonly consumedDeployOutputTypes = [];
    public readonly producedEventsSupportedTypes = [];
    public readonly providedEventType = null;
    public readonly supportsTagging = true;

    public check(serviceContext: ServiceContext<KmsServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
        const errors: string[] = checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
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
        return errors;
    }

    public async deploy(ownServiceContext: ServiceContext<KmsServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
        const stackName = ownServiceContext.stackName();
        winston.info(`${SERVICE_NAME} - Deploying KMS Key ${stackName}`);

        const compiledTemplate = await getCompiledTemplate(ownServiceContext);
        const stackTags = tagging.getTags(ownServiceContext);
        const deployedStack = await deployPhase.deployCloudFormationStack(ownServiceContext, stackName, compiledTemplate, [], true, 30, stackTags);
        winston.info(`${SERVICE_NAME} - Finished deploying KMS Key ${stackName}`);
        return getDeployContext(ownServiceContext, deployedStack);
    }

    public async unDeploy(ownServiceContext: ServiceContext<KmsServiceConfig>): Promise<UnDeployContext> {
        return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
    }
}
