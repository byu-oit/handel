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
    ServiceDeployer,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import { awsCalls, bindPhase, checkPhase, deletePhases, deployPhase, handlebars, preDeployPhase, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import * as rdsDeployersCommon from '../../common/rds-deployers-common';
import { HandlebarsPostgreSQLTemplate, PostgreSQLConfig, PostgreSQLStorageType } from './config-types';

const SERVICE_NAME = 'PostgreSQL';
const POSTGRES_PORT = 5432;
const POSTGRES_PROTOCOL = 'tcp';

function getParameterGroupFamily(postgresVersion: string) {
    if (postgresVersion.startsWith('9.3')) {
        return 'postgres9.3';
    }
    else if (postgresVersion.startsWith('9.4')) {
        return 'postgres9.4';
    }
    else if (postgresVersion.startsWith('9.5')) {
        return 'postgres9.5';
    }
    else if (postgresVersion.startsWith('9.6')) {
        return 'postgres9.6';
    }
    else if (postgresVersion.startsWith('10.1')) {
        return 'postgres10';
    }
    else if (postgresVersion.startsWith('10.3')) {
        return 'postgres10';
    }
    else if (postgresVersion.startsWith('10.4')) {
        return 'postgres10';
    }
    else {
        throw new Error(`Attempted to generate postgress instance with unsupported version: ${postgresVersion}`);
    }
}

async function getCompiledPostgresTemplate(stackName: string,
    ownServiceContext: ServiceContext<PostgreSQLConfig>,
    ownPreDeployContext: PreDeployContext): Promise<string> {
    const serviceParams = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;

    const postgresVersion = serviceParams.postgres_version;
    const dbName = stackName.toLowerCase();
    const handlebarsParams: HandlebarsPostgreSQLTemplate = {
        description: serviceParams.description || 'Parameter group for ' + stackName,
        storageGB: serviceParams.storage_gb || 5,
        instanceType: serviceParams.instance_type || 'db.t2.micro',
        dbName,
        databaseName: serviceParams.database_name,
        dbSubnetGroup: accountConfig.rds_subnet_group,
        postgresVersion,
        dbPort: POSTGRES_PORT,
        storageType: serviceParams.storage_type || PostgreSQLStorageType.STANDARD,
        dbSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId!,
        parameterGroupFamily: getParameterGroupFamily(postgresVersion),
        tags: tagging.getTags(ownServiceContext)
    };

    // Add parameters to parameter group if specified
    if (serviceParams.db_parameters) {
        handlebarsParams.parameterGroupParams = serviceParams.db_parameters;
    }

    // Set multiAZ if user-specified
    if (serviceParams.multi_az) {
        handlebarsParams.multi_az = true;
    }

    return handlebars.compileTemplate(`${__dirname}/postgresql-template.yml`, handlebarsParams);
}

export class Service implements ServiceDeployer {
    public readonly producedDeployOutputTypes = [
        DeployOutputType.EnvironmentVariables,
        DeployOutputType.SecurityGroups
    ];
    public readonly consumedDeployOutputTypes = [];
    public readonly producedEventsSupportedTypes = [];
    public readonly providedEventType = null;
    public readonly supportsTagging = true;

    public check(serviceContext: ServiceContext<PostgreSQLConfig>,
        dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
        const errors: string[] = checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);

        try {
            if (serviceContext.params.postgres_version) {
                getParameterGroupFamily(serviceContext.params.postgres_version);
            }
        } catch (error) {
            errors.push(error);
        }

        return errors.map(error => `${SERVICE_NAME} - ${error}`);
    }

    public async preDeploy(serviceContext: ServiceContext<PostgreSQLConfig>): Promise<PreDeployContext> {
        return preDeployPhase.preDeployCreateSecurityGroup(serviceContext, POSTGRES_PORT, SERVICE_NAME);
    }

    public async bind(ownServiceContext: ServiceContext<PostgreSQLConfig>,
        ownPreDeployContext: PreDeployContext,
        dependentOfServiceContext: ServiceContext<ServiceConfig>,
        dependentOfPreDeployContext: PreDeployContext): Promise<BindContext> {
        return bindPhase.bindDependentSecurityGroup(ownServiceContext,
            ownPreDeployContext,
            dependentOfServiceContext,
            dependentOfPreDeployContext,
            POSTGRES_PROTOCOL,
            POSTGRES_PORT,
            SERVICE_NAME);
    }

    public async deploy(ownServiceContext: ServiceContext<PostgreSQLConfig>,
        ownPreDeployContext: PreDeployContext,
        dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
        const stackName = ownServiceContext.stackName();
        winston.info(`${SERVICE_NAME} - Deploying database '${stackName}'`);

        const stack = await awsCalls.cloudFormation.getStack(stackName);
        if (!stack) {
            const dbUsername = rdsDeployersCommon.getNewDbUsername();
            const dbPassword = rdsDeployersCommon.getNewDbPassword();
            const compiledTemplate = await getCompiledPostgresTemplate(stackName,
                ownServiceContext,
                ownPreDeployContext);
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
            winston.debug(`${SERVICE_NAME} - Finished creating CloudFormation stack '${stackName}'`);

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

    public async unPreDeploy(ownServiceContext: ServiceContext<PostgreSQLConfig>): Promise<UnPreDeployContext> {
        return deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
    }

    public async unBind(ownServiceContext: ServiceContext<PostgreSQLConfig>): Promise<UnBindContext> {
        return deletePhases.unBindSecurityGroups(ownServiceContext, SERVICE_NAME);
    }

    public async unDeploy(ownServiceContext: ServiceContext<PostgreSQLConfig>): Promise<UnDeployContext> {
        const unDeployContext = await deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
        await deletePhases.deleteServiceItemsFromSSMParameterStore(ownServiceContext, ['db_username', 'db_password']);
        return unDeployContext;
    }
}
