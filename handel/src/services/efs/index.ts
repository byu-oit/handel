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
import {
    awsCalls,
    bindPhase,
    deletePhases,
    deployPhase,
    handlebars,
    preDeployPhase,
    tagging
} from 'handel-extension-support';
import * as winston from 'winston';
import {EfsServiceConfig} from './config-types';

const SERVICE_NAME = 'EFS';
const EFS_PORT = 2049;
const EFS_SG_PROTOCOL = 'tcp';

interface EfsPerformanceModeMap {
    [key: string]: string;
}

const EFS_PERFORMANCE_MODE_MAP: EfsPerformanceModeMap = {
    'general_purpose': 'generalPurpose',
    'max_io': 'maxIO'
};

async function getMountScript(fileSystemId: string, region: string, mountDir: string): Promise<string> {
    const variables = { // TODO - REPLACE THIS WITH SOMETHING ELSE
        'EFS_FILE_SYSTEM_ID': fileSystemId,
        'EFS_REGION': region,
        'EFS_MOUNT_DIR': mountDir
    };
    const mountScript = await handlebars.compileTemplate(`${__dirname}/mount-script-template.sh`, variables);
    return mountScript;
}

async function getDeployContext(serviceContext: ServiceContext<EfsServiceConfig>, fileSystemId: string, region: string, fileSystemName: string): Promise<DeployContext> {
    const deployContext = new DeployContext(serviceContext);

    const mountDir = `/mnt/share/${fileSystemName}`;
    const mountScript = await getMountScript(fileSystemId, region, mountDir);
    deployContext.addEnvironmentVariables({
        'MOUNT_DIR': mountDir
    });
    deployContext.scripts.push(mountScript);
    return deployContext;
}

function getFileSystemIdFromStack(stack: AWS.CloudFormation.Stack): string {
    const fileSystemId = awsCalls.cloudFormation.getOutput('EFSFileSystemId', stack);
    if (fileSystemId) {
        return fileSystemId;
    }
    else {
        throw new Error(`Couldn't find ${SERVICE_NAME} file system ID in CloudFormation stack outputs`);
    }
}

async function getCompiledEfsTemplate(stackName: string, ownServiceContext: ServiceContext<EfsServiceConfig>, ownPreDeployContext: PreDeployContext): Promise<string> {
    const accountConfig = ownServiceContext.accountConfig;
    const serviceParams = ownServiceContext.params;

    // Choose performance mode
    let performanceMode = 'generalPurpose'; // Default
    if (serviceParams.performance_mode) {
        performanceMode = EFS_PERFORMANCE_MODE_MAP[serviceParams.performance_mode];
    }

    // Set up mount targets information
    const subnetIds = accountConfig.data_subnets;
    const subnetAId = subnetIds[0]; // Default to using a single subnet for the ids (if they only provided one)
    let subnetBId = subnetIds[0];
    if (subnetIds.length > 1) { // Use multiple subnets if provided
        subnetBId = subnetIds[1];
    }
    const securityGroupId = ownPreDeployContext.securityGroups[0].GroupId;

    const handlebarsParams = {
        fileSystemName: stackName,
        performanceMode,
        securityGroupId,
        subnetAId,
        subnetBId,
        tags: tagging.getTags(ownServiceContext)
    };

    return handlebars.compileTemplate(`${__dirname}/efs-template.yml`, handlebarsParams);
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<EfsServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors = [];
    const params = serviceContext.params;
    const perfModeParam = params.performance_mode;
    if (perfModeParam) {
        if (perfModeParam !== 'general_purpose' && perfModeParam !== 'max_io') {
            errors.push(`${SERVICE_NAME} - 'performance_mode' parameter must be either 'general_purpose' or 'max_io'`);
        }
    }
    return errors;
}

export async function preDeploy(serviceContext: ServiceContext<EfsServiceConfig>): Promise<PreDeployContext> {
    return preDeployPhase.preDeployCreateSecurityGroup(serviceContext, null, SERVICE_NAME);
}

export async function bind(ownServiceContext: ServiceContext<EfsServiceConfig>, ownPreDeployContext: PreDeployContext, dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: PreDeployContext): Promise<BindContext> {
    return bindPhase.bindDependentSecurityGroup(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, EFS_SG_PROTOCOL, EFS_PORT, SERVICE_NAME);
}

export async function deploy(ownServiceContext: ServiceContext<EfsServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const accountConfig = ownServiceContext.accountConfig;
    const stackName = ownServiceContext.stackName();
    winston.info(`${SERVICE_NAME} - Deploying EFS mount '${stackName}'`);

    const compiledTemplate = await getCompiledEfsTemplate(stackName, ownServiceContext, ownPreDeployContext);
    const stackTags = tagging.getTags(ownServiceContext);
    const deployedStack = await deployPhase.deployCloudFormationStack(ownServiceContext, stackName, compiledTemplate, [], false, 30, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying EFS mount '${stackName}'`);
    const fileSystemId = getFileSystemIdFromStack(deployedStack);
    return getDeployContext(ownServiceContext, fileSystemId, accountConfig.region, stackName);

}

export async function unPreDeploy(ownServiceContext: ServiceContext<EfsServiceConfig>): Promise<UnPreDeployContext> {
    return deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

export async function unBind(ownServiceContext: ServiceContext<EfsServiceConfig>): Promise<UnBindContext> {
    return deletePhases.unBindSecurityGroups(ownServiceContext, SERVICE_NAME);
}

export async function unDeploy(ownServiceContext: ServiceContext<EfsServiceConfig>): Promise<UnDeployContext> {
    return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedTypes = [];

export const producedDeployOutputTypes = [
    DeployOutputType.EnvironmentVariables,
    DeployOutputType.Scripts,
    DeployOutputType.SecurityGroups
];

export const consumedDeployOutputTypes = [];

export const supportsTagging = true;
