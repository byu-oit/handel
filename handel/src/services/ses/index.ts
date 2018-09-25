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
    ServiceDeployer
} from 'handel-extension-api';
import { checkPhase } from 'handel-extension-support';
import * as winston from 'winston';
import * as sesCalls from '../../aws/ses-calls';
import { SesServiceConfig } from './config-types';

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

export class Service implements ServiceDeployer {
    public readonly producedDeployOutputTypes = [
        DeployOutputType.EnvironmentVariables,
        DeployOutputType.Policies
    ];
    public readonly consumedDeployOutputTypes = [];
    public readonly producedEventsSupportedTypes = [];
    public readonly providedEventType = null;
    public readonly supportsTagging = false;

    public check(serviceContext: ServiceContext<SesServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
        const errors: string[] = checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
        return errors.map(error => `${SERVICE_NAME} - ${error}`);
    }

    public async deploy(ownServiceContext: ServiceContext<SesServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
        const address = ownServiceContext.params.address;
        winston.info(`${SERVICE_NAME} - Deploying email address ${address}`);
        await sesCalls.verifyEmailAddress(address);
        winston.info(`${SERVICE_NAME} - Finished deploying email address ${address}`);
        return getDeployContext(ownServiceContext);
    }
}
