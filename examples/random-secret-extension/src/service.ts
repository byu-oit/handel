/*
 *  @license
 *    Copyright 2018 Brigham Young University
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

import { SSM } from 'aws-sdk';
import { DescribeParametersRequest } from 'aws-sdk/clients/ssm';
import constantCase = require('constant-case');
import {
    DeployContext,
    PreDeployContext,
    ServiceConfig,
    ServiceContext,
    ServiceDeployer,
    UnDeployContext
} from 'handel-extension-api';
import { generate } from 'randomstring';
import * as log from 'winston';

const VALID_PARAMETER_NAME = /^([a-zA-Z0-9_.\-\/]+)$/;
const SERVICE_NAME = 'Random Secret';

const MAXIMUM_LENGTH = 4096;

const DEFAULT_CHARSET = 'alphanumeric';
const DEFAULT_LENGTH = 32;

export class RandomSecretService implements ServiceDeployer {

    public readonly consumedDeployOutputTypes = [];
    public readonly producedDeployOutputTypes = ['environmentVariables'];
    public readonly producedEventsSupportedServices = [];
    public readonly supportsTagging = false;

    public check(serviceContext: ServiceContext<RandomSecretConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
        const {params} = serviceContext;
        const {name, length, charset} = params;
        const errors = [];

        if (name && !VALID_PARAMETER_NAME.test(name)) {
            errors.push('\'name\' parameter can only contain alphanumeric characters, periods (.), dashes (-), and forward slashes (/)');
        }
        if (length && (length < 1 || length > MAXIMUM_LENGTH)) {
            errors.push(`'length' parameter must be between '1' and '${MAXIMUM_LENGTH}'`);
        }
        if (charset && charset.length < 10) {
            errors.push('\'charset\' parameter must include more than 10 characters');
        }

        return errors.map(it => SERVICE_NAME + ' - ' + it);
    }

    public async deploy(ownServiceContext: ServiceContext<RandomSecretConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
        const {params, accountConfig, appName, environmentName, serviceName} = ownServiceContext;
        const ssm = new SSM({region: accountConfig.region});

        const name = params.name || `${appName}.${environmentName}.${serviceName}`;

        if (await parameterExists(ssm, name)) {
            log.info(SERVICE_NAME + ' - Parameter already exists. Skipping deployment.');
            return getDeployContext(ownServiceContext, name);
        }

        const value = generateValue(
            params.charset || DEFAULT_CHARSET,
            params.length || DEFAULT_LENGTH,
        );

        await createParameter(ssm, name, value);
        return getDeployContext(ownServiceContext, name);
    }

    public async unDeploy(ownServiceContext: ServiceContext<RandomSecretConfig>): Promise<UnDeployContext> {
        const {params, accountConfig, appName, environmentName, serviceName} = ownServiceContext;
        const ssm = new SSM({region: accountConfig.region});

        const name = params.name || `${appName}.${environmentName}.${serviceName}`;

        if (await parameterExists(ssm, name)) {
            await deleteParameter(ssm, name);
        }
        return new UnDeployContext(ownServiceContext);
    }

}

async function deleteParameter(ssm: SSM, name: string) {
    await ssm.deleteParameter({
        Name: name
    }).promise();
}

async function createParameter(ssm: SSM, name: string, value: string) {
    await ssm.putParameter({
        Name: name,
        Value: value,
        Type: 'SecureString'
    }).promise();
}

function getDeployContext(context: ServiceContext<ServiceConfig>, name: string): DeployContext {
    const result = new DeployContext(context);
    result.addEnvironmentVariables({
        [constantCase(context.serviceName + '_parameter_name')]: name
    });
    result.policies = getIamPoliciesFor(context, name);

    return result;
}

function getIamPoliciesFor(context: ServiceContext<ServiceConfig>, name: string): any[] {
    const {accountConfig} = context;
    return [
        {
            'Effect': 'Allow',
            'Action': [
                'ssm:GetParameter*'
            ],
            'Resource': [
                `arn:aws:ssm:${accountConfig.region}:${accountConfig.account_id}:parameter/${name}`
            ]
        }
    ];
}

async function parameterExists(ssm: SSM, name: string): Promise<boolean> {
    const response = await ssm.describeParameters({
        Filters: [{
            Key: 'Name',
            Values: [name]
        }]
    } as DescribeParametersRequest).promise();
    return !!response.Parameters && response.Parameters.length > 0;
}

function generateValue(charset: RandomCharset, length: number) {
    return generate({
        length: length,
        charset: charset
    });
}

export interface RandomSecretConfig extends ServiceConfig {
    name?: string;
    length?: number;
    charset?: RandomCharset;
}

export type RandomCharset = 'alphanumeric' | 'alphabetic' | 'numeric' | 'hex' | string;
