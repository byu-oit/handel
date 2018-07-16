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
    BindContext,
    DeployContext,
    DeployOutputType,
    PreDeployContext,
    ServiceConfig,
    ServiceContext,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import { awsCalls, bindPhase, checkPhase, deletePhases, deployPhase, handlebars, preDeployPhase, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import * as rdsDeployersCommon from '../../common/rds-deployers-common';
import { AuroraConfig } from './config-types';

const SERVICE_NAME = 'Aurora';
const DB_PROTOCOL = 'tcp';
const DB_PORT = 3306;

function getCompiledAuroraTemplate(stackName: string,
                                  ownServiceContext: ServiceContext<AuroraConfig>,
                                  ownPreDeployContext: PreDeployContext) {
    const handlebarsParams = {};

    return handlebars.compileTemplate(`${__dirname}/mysql-template.yml`, handlebarsParams);
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<AuroraConfig>,
                      dependenciesServiceContext: Array<ServiceContext<ServiceConfig>>): string[] {
    return checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
}

export function preDeploy(serviceContext: ServiceContext<AuroraConfig>): Promise<PreDeployContext> {
    return preDeployPhase.preDeployCreateSecurityGroup(serviceContext, DB_PORT, SERVICE_NAME);
}

export function bind(ownServiceContext: ServiceContext<AuroraConfig>,
                     ownPreDeployContext: PreDeployContext,
                     dependentOfServiceContext: ServiceContext<ServiceConfig>,
                     dependentOfPreDeployContext: PreDeployContext): Promise<BindContext> {
    return bindPhase.bindDependentSecurityGroup(ownServiceContext,
        ownPreDeployContext,
        dependentOfServiceContext,
        dependentOfPreDeployContext,
        DB_PROTOCOL,
        DB_PORT,
        SERVICE_NAME);
}

export async function deploy(ownServiceContext: ServiceContext<AuroraConfig>,
                             ownPreDeployContext: PreDeployContext,
                             dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = ownServiceContext.stackName();
    winston.info(`${SERVICE_NAME} - Deploying database '${stackName}'`);

    const stack = await awsCalls.cloudFormation.getStack(stackName);
    if (!stack) {
        const dbUsername = rdsDeployersCommon.getNewDbUsername();
        const dbPassword = rdsDeployersCommon.getNewDbPassword();
        const compiledTemplate = await getCompiledAuroraTemplate(stackName, ownServiceContext, ownPreDeployContext);
        const cfParameters = awsCalls.cloudFormation.getCfStyleStackParameters({
            DBUsername: dbUsername,
            DBPassword: dbPassword
        });
        const stackTags = tagging.getTags(ownServiceContext);
        winston.debug(`${SERVICE_NAME} - Creating CloudFormation stack '${stackName}'`);
        const deployedStack = await awsCalls.cloudFormation.createStack(stackName,
                                                                    compiledTemplate,
                                                                    cfParameters,
                                                                    30,
                                                                    stackTags);
        winston.debug(`${SERVICE_NAME} - Finished creating CloudFormation stack '${stackName}`);

        // Add DB credentials to the Parameter Store
        await Promise.all([
            deployPhase.addItemToSSMParameterStore(ownServiceContext, 'db_username', dbUsername),
            deployPhase.addItemToSSMParameterStore(ownServiceContext, 'db_password', dbPassword)
        ]);

        winston.info(`${SERVICE_NAME} - Finished deploying database '${stackName}'`);
        return rdsDeployersCommon.getDeployContext(ownServiceContext, deployedStack);
    }
    else {
        winston.info(`${SERVICE_NAME} - Updates are not supported for this service.`);
        return rdsDeployersCommon.getDeployContext(ownServiceContext, stack);
    }
}

export function unPreDeploy(ownServiceContext: ServiceContext<AuroraConfig>): Promise<UnPreDeployContext> {
    return deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

export function unBind(ownServiceContext: ServiceContext<AuroraConfig>): Promise<UnBindContext> {
    return deletePhases.unBindSecurityGroups(ownServiceContext, SERVICE_NAME);
}

export async function unDeploy(ownServiceContext: ServiceContext<AuroraConfig>): Promise<UnDeployContext> {
    const unDeployContext = await deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
    await deletePhases.deleteServiceItemsFromSSMParameterStore(ownServiceContext, ['db_username', 'db_password']);
    return unDeployContext;
}

export const producedEventsSupportedTypes = [];

export const producedDeployOutputTypes = [
    DeployOutputType.EnvironmentVariables,
    DeployOutputType.SecurityGroups
];

export const consumedDeployOutputTypes = [];

export const supportsTagging = true;
