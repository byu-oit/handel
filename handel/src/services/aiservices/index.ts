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
    ServiceContext
} from 'handel-extension-api';
import { checkPhase, handlebars } from 'handel-extension-support';
import * as winston from 'winston';
import { AIServicesConfig } from './config-types';

const SERVICE_NAME = 'AI Services';

function dedupArray(a: string[]): string[] {
    return Array.from(new Set(a));
}

interface AIServicePolicies {
    [serviceName: string]: (serviceContext: ServiceContext<AIServicesConfig>) => Promise<string>;
}

const aiServicePolicies: AIServicePolicies = {
    'rekognition': async (serviceContext: ServiceContext<AIServicesConfig>) => {
        const params = {
            region: serviceContext.accountConfig.region,
            accountId: serviceContext.accountConfig.account_id,
            collectionPrefix: `${serviceContext.appName}-${serviceContext.environmentName}`
        };
        const compiledTemplate = await handlebars.compileTemplate(`${__dirname}/rekognition-statements.json`, params);
        return JSON.parse(compiledTemplate);
    },
    'polly': async (serviceContext: ServiceContext<AIServicesConfig>) => {
        const params = {
            region: serviceContext.accountConfig.region,
            accountId: serviceContext.accountConfig.account_id,
            lexiconName: `${serviceContext.appName}-${serviceContext.environmentName}`
        };
        const compiledTemplate = await handlebars.compileTemplate(`${__dirname}/polly-statements.json`, params);
        return JSON.parse(compiledTemplate);
    }
};

async function getDeployContext(serviceContext: ServiceContext<AIServicesConfig>): Promise<DeployContext> {
    const serviceParams = serviceContext.params;
    const deployContext = new DeployContext(serviceContext);

    // Inject policies
    const aiServices = dedupArray(serviceParams.ai_services);
    for (const service of aiServices) {
        if(!aiServicePolicies[service]) {
            throw new Error(`Unsupported AI service: ${service}`);
        }

        const serviceStatements = await aiServicePolicies[service](serviceContext);
        for (const serviceStatement of serviceStatements) {
            deployContext.policies.push(serviceStatement);
        }
    }

    return deployContext;
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<AIServicesConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors: string[] = checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
    return errors.map(error => `${SERVICE_NAME} - ${error}`);
}

export async function deploy(ownServiceContext: ServiceContext<AIServicesConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = ownServiceContext.stackName();
    winston.info(`${SERVICE_NAME} - Deploying '${stackName}'`);
    return getDeployContext(ownServiceContext);
}

export const producedEventsSupportedTypes = [];

export const producedDeployOutputTypes = [
    DeployOutputType.Policies
];

export const consumedDeployOutputTypes = [];

export const supportsTagging = false;
