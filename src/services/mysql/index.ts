/*
 * Copyright 2017 Brigham Young University
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
import * as winston from 'winston';
import * as cloudFormationCalls from '../../aws/cloudformation-calls';
import * as bindPhaseCommon from '../../common/bind-phase-common';
import * as deletePhasesCommon from '../../common/delete-phases-common';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as handlebarsUtils from '../../common/handlebars-utils';
import * as preDeployPhaseCommon from '../../common/pre-deploy-phase-common';
import * as rdsDeployersCommon from '../../common/rds-deployers-common';
import { BindContext } from '../../datatypes/bind-context';
import { DeployContext } from '../../datatypes/deploy-context';
import { PreDeployContext } from '../../datatypes/pre-deploy-context';
import { ServiceContext } from '../../datatypes/service-context';
import { UnBindContext } from '../../datatypes/un-bind-context';
import { UnDeployContext } from '../../datatypes/un-deploy-context';
import { UnPreDeployContext } from '../../datatypes/un-pre-deploy-context';

const SERVICE_NAME = 'MySQL';
const MYSQL_PORT = 3306;
const MYSQL_PROTOCOL = 'tcp';

function getParameterGroupFamily(mysqlVersion: string) {
    if (mysqlVersion.startsWith('5.5')) {
        return 'mysql5.5';
    }
    else if (mysqlVersion.startsWith('5.6')) {
        return 'mysql5.6';
    }
    else {
        return 'mysql5.7';
    }
}

function getCompiledMysqlTemplate(stackName: string,
                                  ownServiceContext: ServiceContext,
                                  ownPreDeployContext: PreDeployContext) {
    const serviceParams = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;

    const mysqlVersion = serviceParams.mysql_version;

    const handlebarsParams: any = {
        description: serviceParams.description || 'Parameter group for ' + stackName,
        storageGB: serviceParams.storage_gb || 5,
        instanceType: serviceParams.instance_type || 'db.t2.micro',
        stackName,
        databaseName: serviceParams.database_name,
        dbSubnetGroup: accountConfig.rds_subnet_group,
        mysqlVersion,
        dbPort: MYSQL_PORT,
        storageType: serviceParams.storage_type || 'standard',
        dbSecurityGroupId: ownPreDeployContext.securityGroups[0].GroupId,
        parameterGroupFamily: getParameterGroupFamily(mysqlVersion),
        tags: deployPhaseCommon.getTags(ownServiceContext)
    };

    // Add parameters to parameter group if specified
    if (serviceParams.db_parameters) {
        handlebarsParams.parameterGroupParams = serviceParams.db_parameters;
    }

    // Set multiAZ if user-specified
    if (serviceParams.multi_az) {
        handlebarsParams.multi_az = true;
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/mysql-template.yml`, handlebarsParams);
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext,
                      dependenciesServiceContext: ServiceContext[]): string[] {
    const errors = [];
    const serviceParams = serviceContext.params;

    if (!serviceParams.database_name) {
        errors.push(`${SERVICE_NAME} - The 'database_name' parameter is required`);
    }
    if (!serviceParams.mysql_version) {
        errors.push(`${SERVICE_NAME} - The 'mysql_version' parameter is required`);
    }

    return errors;
}

export function preDeploy(serviceContext: ServiceContext): Promise<PreDeployContext> {
    return preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, MYSQL_PORT, SERVICE_NAME);
}

export function bind(ownServiceContext: ServiceContext,
                     ownPreDeployContext: PreDeployContext,
                     dependentOfServiceContext: ServiceContext,
                     dependentOfPreDeployContext: PreDeployContext): Promise<BindContext> {
    return bindPhaseCommon.bindDependentSecurityGroupToSelf(ownServiceContext,
                                                            ownPreDeployContext,
                                                            dependentOfServiceContext,
                                                            dependentOfPreDeployContext,
                                                            MYSQL_PROTOCOL,
                                                            MYSQL_PORT,
                                                            SERVICE_NAME);
}

export async function deploy(ownServiceContext: ServiceContext,
                             ownPreDeployContext: PreDeployContext,
                             dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying database '${stackName}'`);

    const stack = await cloudFormationCalls.getStack(stackName);
    if (!stack) {
        const dbUsername = rdsDeployersCommon.getNewDbUsername();
        const dbPassword = rdsDeployersCommon.getNewDbPassword();
        const compiledTemplate = await getCompiledMysqlTemplate(stackName, ownServiceContext, ownPreDeployContext);
        const cfParameters = cloudFormationCalls.getCfStyleStackParameters({
            DBUsername: dbUsername,
            DBPassword: dbPassword
        });
        const stackTags = deployPhaseCommon.getTags(ownServiceContext);
        winston.debug(`${SERVICE_NAME} - Creating CloudFormation stack '${stackName}'`);
        const deployedStack = await cloudFormationCalls.createStack(stackName,
                                                                    compiledTemplate,
                                                                    cfParameters,
                                                                    stackTags);
        winston.debug(`${SERVICE_NAME} - Finished creating CloudFormation stack '${stackName}`);
        await rdsDeployersCommon.addDbCredentialToParameterStore(ownServiceContext,
                                                                  dbUsername,
                                                                  dbPassword,
                                                                  deployedStack);
        return rdsDeployersCommon.getDeployContext(ownServiceContext, deployedStack);
    }
    else {
        winston.info(`${SERVICE_NAME} - Updates are not supported for this service.`);
        return rdsDeployersCommon.getDeployContext(ownServiceContext, stack);
    }
}

export function unPreDeploy(ownServiceContext: ServiceContext): Promise<UnPreDeployContext> {
    return deletePhasesCommon.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

export function unBind(ownServiceContext: ServiceContext): Promise<UnBindContext> {
    return deletePhasesCommon.unBindSecurityGroups(ownServiceContext, SERVICE_NAME);
}

export async function unDeploy(ownServiceContext: ServiceContext): Promise<UnDeployContext> {
    const unDeployContext = await deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
    return rdsDeployersCommon.deleteParametersFromParameterStore(ownServiceContext, unDeployContext);
}

export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = [
    'environmentVariables',
    'securityGroups'
];

export const consumedDeployOutputTypes = [];
