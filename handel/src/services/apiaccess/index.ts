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
import * as fs from 'fs';
import { DeployContext, PreDeployContext, ServiceConfig, ServiceContext } from 'handel-extension-api';
import * as winston from 'winston';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as util from '../../common/util';
import { APIAccessConfig } from './config-types';

const SERVICE_NAME = 'API Access';

function getDeployContext(serviceContext: ServiceContext<APIAccessConfig>): DeployContext {
    const serviceParams = serviceContext.params;
    const deployContext = new DeployContext(serviceContext);

    // Inject policies
    for (const service of serviceParams.aws_services) {
        const statementsPath = `${__dirname}/${service}-statements.json`;
        const serviceStatements = JSON.parse(util.readFileSync(statementsPath));
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

export function check(serviceContext: ServiceContext<APIAccessConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors = [];

    const serviceParams = serviceContext.params;
    if (!serviceParams.aws_services) {
        errors.push(`${SERVICE_NAME} - The 'aws_services' parameter is required.`);
    }
    else {
        for (const service of serviceParams.aws_services) {
            const statementsPath = `${__dirname}/${service}-statements.json`;
            if (!fs.existsSync(statementsPath)) {
                errors.push(`${SERVICE_NAME} - The 'aws_service' value '${service}' is not supported`);
            }
        }
    }

    return errors;
}

export async function deploy(ownServiceContext: ServiceContext<APIAccessConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = ownServiceContext.getResourceName();
    winston.info(`${SERVICE_NAME} - Deploying ${SERVICE_NAME} '${stackName}'`);
    return getDeployContext(ownServiceContext);
}

export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = [
    'policies'
];

export const consumedDeployOutputTypes = [];

export const supportsTagging = false;
