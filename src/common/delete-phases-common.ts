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
import * as winston from 'winston';
import * as cloudformationCalls from '../aws/cloudformation-calls';
import * as ec2Calls from '../aws/ec2-calls';
import * as s3Calls from '../aws/s3-calls';
import { AccountConfig, ServiceConfig, ServiceContext, UnBindContext, UnDeployContext, UnPreDeployContext } from '../datatypes';
import * as deployPhaseCommon from './deploy-phase-common';

async function unBindAllOnSg(stackName: string, accountConfig: AccountConfig) {
    const sgName = `${stackName}-sg`;
    await ec2Calls.removeAllIngressFromSg(sgName, accountConfig.vpc);
    return true;
}

async function deleteSecurityGroupForService(stackName: string) {
    const sgName = `${stackName}-sg`;
    const stack = await cloudformationCalls.getStack(sgName);
    if (stack) {
        return cloudformationCalls.deleteStack(sgName);
    }
    else {
        return true;
    }
}

export async function unDeployService(serviceContext: ServiceContext<ServiceConfig>, serviceType: string) {
    const accountConfig = serviceContext.accountConfig;
    const stackName = deployPhaseCommon.getResourceName(serviceContext);
    winston.info(`${serviceType} - Undeploying service '${stackName}'`);

    // Delete stack if needed
    const stack = await cloudformationCalls.getStack(stackName);
    if (stack) {
        winston.debug(`${serviceType} - Deleting stack '${stackName}'`);
        await cloudformationCalls.deleteStack(stackName);
    }
    else {
        winston.debug(`${serviceType} - Stack '${stackName}' has already been deleted`);
    }

    // Cleanup uploaded S3 files for service
    const name = {
        bucket: `handel-${accountConfig.region}-${accountConfig.account_id}`,
        prefix: `${serviceContext.appName}/${serviceContext.environmentName}/${serviceContext.serviceName}`
    };
    await s3Calls.deleteMatchingPrefix(name.bucket, name.prefix);

    winston.info(`${serviceType} -- Finished undeploying service '${stackName}'`);
    return new UnDeployContext(serviceContext);
}

export async function unPreDeploySecurityGroup(ownServiceContext: ServiceContext<ServiceConfig>, serviceName: string) {
    const sgName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${serviceName} - Deleting security group '${sgName}'`);

    const success = await deleteSecurityGroupForService(sgName);
    winston.info(`${serviceName} - Finished deleting security group '${sgName}'`);
    return new UnPreDeployContext(ownServiceContext);
}

export async function unBindSecurityGroups(ownServiceContext: ServiceContext<ServiceConfig>, serviceName: string) {
    const sgName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${serviceName} - Unbinding security group '${sgName}'`);

    const success = await unBindAllOnSg(sgName, ownServiceContext.accountConfig);
    winston.info(`${serviceName} - Finished unbinding security group '${sgName}'`);
    return new UnBindContext(ownServiceContext);
}
