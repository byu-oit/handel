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
    Tags,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext,
} from 'handel-extension-api';
import {
    awsCalls,
    bindPhase,
    checkPhase,
    deletePhases,
    deployPhase,
    handlebars,
    preDeployPhase,
    tagging
} from 'handel-extension-support';
import * as winston from 'winston';
import * as rdsDeployersCommon from '../../common/rds-deployers-common';
import { AuroraConfig, AuroraEngine, HandlebarsAuroraTemplate, HandlebarsInstanceConfig } from './config-types';

const SERVICE_NAME = 'Aurora';
const DB_PROTOCOL = 'tcp';
const POSTGRES_PORT = 5432;
const MYSQL_PORT = 3306;

function getEngine(engineParam: AuroraEngine) {
    return `aurora-${engineParam}`;
}

function getPort(params: AuroraConfig) {
    if (params.engine === AuroraEngine.mysql) {
        return MYSQL_PORT;
    } else {
        return POSTGRES_PORT;
    }
}

function getParameterGroupFamily(engine: AuroraEngine, version: string) {
    if (engine === AuroraEngine.mysql) { // MySQL
        if (version.startsWith('5.7')) {
            return 'aurora-mysql5.7';
        }
        else {
            throw new Error('Unsupported version in Aurora MySQL');
        }
    }
    else { // PostgreSQL
        if (version.startsWith('9.6')) {
            return 'aurora-postgresql9.6';
        }
        else {
            throw new Error('Unsupported version in Aurora PostgreSQL');
        }
    }
}

function getInstanceType(params: AuroraConfig): string {
    let instanceType: string;
    if (params.instance_type) {
        instanceType = params.instance_type;
    } else {
        if (params.engine === 'mysql') {
            instanceType = 'db.t2.small'; // The smallest size MySQL Aurora supports
        }
        else {
            instanceType = 'db.r4.large'; // PostgreSQL Aurora doesn't support anything smaller than this
        }
    }
    return instanceType;
}

function getInstancesHandlebarsConfig(params: AuroraConfig): HandlebarsInstanceConfig[] {
    const clusterSize = params.cluster_size || 1;
    const instances: HandlebarsInstanceConfig[] = [];
    for (let i = 0; i < clusterSize; i++) {
        instances.push({
            instanceType: getInstanceType(params)
        });
    }
    return instances;
}

function getCompiledAuroraTemplate(stackName: string,
    ownServiceContext: ServiceContext<AuroraConfig>,
    ownPreDeployContext: PreDeployContext,
    tags: Tags) {
    const params = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;
    const engine = getEngine(params.engine);
    const dbName = stackName.toLowerCase();
    const handlebarsParams: HandlebarsAuroraTemplate = {
        description: params.description || 'Handel-created Aurora cluster',
        parameterGroupFamily: getParameterGroupFamily(params.engine, params.version),
        clusterParameters: params.cluster_parameters,
        instanceParameters: params.instance_parameters,
        tags,
        databaseName: params.database_name,
        dbName,
        dbSubnetGroup: accountConfig.rds_subnet_group,
        engine,
        engineVersion: params.version,
        port: getPort(params),
        dbSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId!,
        instances: getInstancesHandlebarsConfig(params),
        isMySQL: params.engine === AuroraEngine.mysql ? true : false
    };

    return handlebars.compileTemplate(`${__dirname}/aurora-template.yml`, handlebarsParams);
}

function getDeployContext(serviceContext: ServiceContext<ServiceConfig>,
    rdsCfStack: any) { // TODO - Better type later
    const deployContext = new DeployContext(serviceContext);

    // Inject ENV variables to talk to this database
    const clusterEndpoint = awsCalls.cloudFormation.getOutput('ClusterEndpoint', rdsCfStack);
    const port = awsCalls.cloudFormation.getOutput('ClusterPort', rdsCfStack);
    const readEndpoint = awsCalls.cloudFormation.getOutput('ClusterReadEndpoint', rdsCfStack);
    const dbName = awsCalls.cloudFormation.getOutput('DatabaseName', rdsCfStack);

    if (!clusterEndpoint || !port || !readEndpoint || !dbName) {
        throw new Error('Expected RDS service to return address, port, and dbName');
    }

    deployContext.addEnvironmentVariables({
        CLUSTER_ENDPOINT: clusterEndpoint,
        PORT: port,
        READ_ENDPOINT: readEndpoint,
        DATABASE_NAME: dbName
    });

    return deployContext;
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */
export class Service implements ServiceDeployer {
    public readonly producedDeployOutputTypes = [
        DeployOutputType.EnvironmentVariables,
        DeployOutputType.SecurityGroups
    ];
    public readonly consumedDeployOutputTypes = [];
    public readonly producedEventsSupportedTypes = [];
    public readonly providedEventType = null;
    public readonly supportsTagging = true;

    public check(serviceContext: ServiceContext<AuroraConfig>, dependenciesServiceContext: Array<ServiceContext<ServiceConfig>>): string[] {
        return checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
    }

    public async preDeploy(serviceContext: ServiceContext<AuroraConfig>): Promise<PreDeployContext> {
        const dbPort = getPort(serviceContext.params);
        return preDeployPhase.preDeployCreateSecurityGroup(serviceContext, dbPort, SERVICE_NAME);
    }

    public async bind(ownServiceContext: ServiceContext<AuroraConfig>, ownPreDeployContext: PreDeployContext, dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: PreDeployContext): Promise<BindContext> {
        const dbPort = getPort(ownServiceContext.params);
        return bindPhase.bindDependentSecurityGroup(ownServiceContext,
            ownPreDeployContext,
            dependentOfServiceContext,
            dependentOfPreDeployContext,
            DB_PROTOCOL,
            dbPort,
            SERVICE_NAME);
    }

    public async deploy(ownServiceContext: ServiceContext<AuroraConfig>,
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
            return getDeployContext(ownServiceContext, deployedStack);
        }
        else {
            winston.info(`${SERVICE_NAME} - Updates are not supported for this service.`);
            return getDeployContext(ownServiceContext, stack);
        }
    }

    public async unPreDeploy(ownServiceContext: ServiceContext<AuroraConfig>): Promise<UnPreDeployContext> {
        return deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
    }

    public async unBind(ownServiceContext: ServiceContext<AuroraConfig>): Promise<UnBindContext> {
        return deletePhases.unBindSecurityGroups(ownServiceContext, SERVICE_NAME);
    }

    public async unDeploy(ownServiceContext: ServiceContext<AuroraConfig>): Promise<UnDeployContext> {
        const unDeployContext = await deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
        await deletePhases.deleteServiceItemsFromSSMParameterStore(ownServiceContext, ['db_username', 'db_password']);
        return unDeployContext;
    }
}
