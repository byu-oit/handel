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
import * as winston from 'winston';
import * as sesCalls from '../../aws/ses-calls';
import { SesServiceConfig } from './config-types';
import { checkPhase } from 'handel-extension-support';

const EMAIL_ADDRESS = /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
const SERVICE_NAME = 'SES';

function getDeployContext(serviceContext: ServiceContext<SesServiceConfig>): DeployContext {
    const deployContext = new DeployContext(serviceContext);

    const account = serviceContext.accountConfig.account_id;
    const address = serviceContext.params.address;
    const region = serviceContext.accountConfig.region;
    const identityArn = `arn:aws:ses:${region}:${account}:identity/${address}`;

    // Env variables to inject into consuming services
    deployContext.addEnvironmentVariables({
        EMAIL_ADDRESS: address,
        IDENTITY_ARN: identityArn
    });

    // Policy to talk to this queue
    deployContext.policies.push({
        'Effect': 'Allow',
        'Action': [
            'ses:SendEmail'
        ],
        'Resource': [
            identityArn
        ]
    });

    return deployContext;
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<SesServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors: string[] = checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
  
    if (!EMAIL_ADDRESS.test(serviceContext.params.address)) {
        errors.push(`An address must be a valid email address`);
    }
    return errors.map(error => `${SERVICE_NAME} - ${error}`);
}

export async function deploy(ownServiceContext: ServiceContext<SesServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const address = ownServiceContext.params.address;
    winston.info(`${SERVICE_NAME} - Deploying email address ${address}`);

    await sesCalls.verifyEmailAddress(address);
    winston.info(`${SERVICE_NAME} - Finished deploying email address ${address}`);
    return getDeployContext(ownServiceContext);
}

export const producedEventsSupportedTypes = [];

export const producedDeployOutputTypes = [
    DeployOutputType.EnvironmentVariables,
    DeployOutputType.Policies
];

export const consumedDeployOutputTypes = [];

export const supportsTagging = false;
