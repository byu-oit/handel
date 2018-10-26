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
import cryptoRandomString = require('crypto-random-string');
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
import { AuroraServerlessConfig, AuroraServerlessEngine, HandlebarsAuroraServerlessTemplate } from './config-types';

const SERVICE_NAME = 'Aurora-Serverless';
const DB_PROTOCOL = 'tcp';
const MYSQL_PORT = 3306;

function getEngine(engineParam: AuroraServerlessEngine) {
    return `aurora`;
}

function getPort(params: AuroraServerlessConfig) {
    return MYSQL_PORT;
}

function getParameterGroupFamily(engine: AuroraServerlessEngine, version: string) {
    if (engine === AuroraServerlessEngine.mysql) { // MySQL
        if (version.startsWith('5.6')) {
            return 'aurora5.6';
        }
        else {
            throw new Error('Unsupported version in Aurora MySQL');
        }
    }
    throw new Error('Unsupported engine in Aurora-Serverless');

}

function getCompiledAuroraTemplate(stackName: string,
    ownServiceContext: ServiceContext<AuroraServerlessConfig>,
    ownPreDeployContext: PreDeployContext,
    tags: Tags) {
    const params = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;
    const engine = getEngine(params.engine);
    const dbName = stackName.toLowerCase();
    const handlebarsParams: HandlebarsAuroraServerlessTemplate = {
        description: params.description || 'Handel-created Aurora cluster',
        parameterGroupFamily: getParameterGroupFamily(params.engine, params.version),
        clusterParameters: params.cluster_parameters,
        tags,
        databaseName: params.database_name,
        dbName,
        dbSubnetGroup: accountConfig.rds_subnet_group,
        engine,
        engineVersion: params.version,
        port: getPort(params),
        dbSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId!,
    };

    if (params.scaling) {
        const scaling = params.scaling;
        handlebarsParams.scaling = {
            autoPause: scaling.auto_pause !== undefined ? scaling.auto_pause : true,
            secondsUntilAutoPause: scaling.seconds_until_auto_pause || 300,
            minCapacity: scaling.min_capacity || 2,
            maxCapacity: scaling.max_capacity || 64
        };
    }

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

    public check(serviceContext: ServiceContext<AuroraServerlessConfig>, dependenciesServiceContext: Array<ServiceContext<ServiceConfig>>): string[] {
        return checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
    }

    public async preDeploy(serviceContext: ServiceContext<AuroraServerlessConfig>): Promise<PreDeployContext> {
        const dbPort = getPort(serviceContext.params);
        return preDeployPhase.preDeployCreateSecurityGroup(serviceContext, dbPort, SERVICE_NAME);
    }

    public async getPreDeployContext(serviceContext: ServiceContext<AuroraServerlessConfig>): Promise<PreDeployContext> {
        return preDeployPhase.getSecurityGroup(serviceContext);
    }

    public async bind(ownServiceContext: ServiceContext<AuroraServerlessConfig>, ownPreDeployContext: PreDeployContext, dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: PreDeployContext): Promise<BindContext> {
        const dbPort = getPort(ownServiceContext.params);
        return bindPhase.bindDependentSecurityGroup(ownServiceContext,
            ownPreDeployContext,
            dependentOfServiceContext,
            dependentOfPreDeployContext,
            DB_PROTOCOL,
            dbPort);
    }

    public async deploy(ownServiceContext: ServiceContext<AuroraServerlessConfig>,
        ownPreDeployContext: PreDeployContext,
        dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
        const stackName = ownServiceContext.stackName();
        winston.info(`${SERVICE_NAME} - Deploying database '${stackName}'`);

        const stack = await awsCalls.cloudFormation.getStack(stackName);
        if (!stack) {
            const dbUsername = rdsDeployersCommon.getNewDbUsername();
            const dbPassword = cryptoRandomString(30);
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

    public async unPreDeploy(ownServiceContext: ServiceContext<AuroraServerlessConfig>): Promise<UnPreDeployContext> {
        return deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
    }

    public async unBind(ownServiceContext: ServiceContext<AuroraServerlessConfig>, ownPreDeployContext: PreDeployContext, dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: PreDeployContext): Promise<UnBindContext> {
        const dbPort = getPort(ownServiceContext.params);
        return deletePhases.unBindService(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, DB_PROTOCOL, dbPort);
    }

    public async unDeploy(ownServiceContext: ServiceContext<AuroraServerlessConfig>): Promise<UnDeployContext> {
        const unDeployContext = await deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
        await deletePhases.deleteServiceItemsFromSSMParameterStore(ownServiceContext, ['db_username', 'db_password']);
        return unDeployContext;
    }
}
