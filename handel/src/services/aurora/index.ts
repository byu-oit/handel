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
    Tags,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext,
} from 'handel-extension-api';
import { awsCalls, bindPhase, checkPhase, deletePhases, deployPhase, handlebars, preDeployPhase, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import * as rdsDeployersCommon from '../../common/rds-deployers-common';
import { AuroraConfig, AuroraEngine, HandlebarsAuroraTemplate } from './config-types';

const SERVICE_NAME = 'Aurora';
const DB_PROTOCOL = 'tcp';
const DB_PORT = 3306;
const DEFAULT_STORAGE_TYPE = 'standard';

function getEngine(engineParam: AuroraEngine) {
    return `aurora-${engineParam}`;
}

function getParameterGroupFamily(engine: AuroraEngine, version: string) {
    if(engine === AuroraEngine.mysql) { // MySQL
        if (version.startsWith('5.7')) {
            return 'aurora-mysql5.7';
        }
        else {
            throw new Error('Unsupported version in Aurora MySQL');
        }
    }
    else { // PostgreSQL
        if(version.startsWith('9.6')) {
            return 'aurora-postgresql9.6';
        }
        else {
            throw new Error('Unsupported version in Aurora PostgreSQL');
        }
    }
}

function getCompiledAuroraTemplate(stackName: string,
                                  ownServiceContext: ServiceContext<AuroraConfig>,
                                  ownPreDeployContext: PreDeployContext,
                                  tags: Tags) {
    const params = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;
    const handlebarsParams: HandlebarsAuroraTemplate = {
        description: params.description || 'Handel-created Aurora cluster',
        parameterGroupFamily: getParameterGroupFamily(params.engine, params.version),
        parameterGroupParams: params.db_parameters || {},
        tags,
        databaseName: params.database_name,
        stackName,
        dbSubnetGroup: accountConfig.rds_subnet_group,
        engine: getEngine(params.engine),
        engineVersion: params.version,
        port: DB_PORT,
        dbSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId!,
        primary: {
            instanceType: params.primary.instance_type,
            storageType: params.primary.storage_type || DEFAULT_STORAGE_TYPE
        }
    };

    if(params.read_replicas) {
        handlebarsParams.readReplicas = [];
        for(let i = 0; i < params.read_replicas.count; i++) {
            handlebarsParams.readReplicas.push({
                instanceType: params.read_replicas.instance_type,
                storageType: params.read_replicas.storage_type || DEFAULT_STORAGE_TYPE
            });
        }
    }

    return handlebars.compileTemplate(`${__dirname}/aurora-template.yml`, handlebarsParams);
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<AuroraConfig>,
                      dependenciesServiceContext: Array<ServiceContext<ServiceConfig>>): string[] {
    // return checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
    return []; // TODO - Implement check (JSON schema)
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
        const tags = tagging.getTags(ownServiceContext);
        const compiledTemplate = await getCompiledAuroraTemplate(stackName, ownServiceContext, ownPreDeployContext, tags);
        console.log(compiledTemplate);
        process.exit(0);
        const cfParameters = awsCalls.cloudFormation.getCfStyleStackParameters({
            DBUsername: dbUsername,
            DBPassword: dbPassword
        });
        winston.debug(`${SERVICE_NAME} - Creating CloudFormation stack '${stackName}'`);
        const deployedStack = await awsCalls.cloudFormation.createStack(stackName,
                                                                    compiledTemplate,
                                                                    cfParameters,
                                                                    30,
                                                                    tags);
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
