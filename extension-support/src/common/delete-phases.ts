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
    PreDeployContext,
    ServiceConfig,
    ServiceContext,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import * as cloudformationCalls from '../aws/cloudformation-calls';
import * as ec2Calls from '../aws/ec2-calls';
import * as s3Calls from '../aws/s3-calls';
import * as ssmCalls from '../aws/ssm-calls';

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
    const stackName = serviceContext.stackName();

    // Delete stack if needed
    const stack = await cloudformationCalls.getStack(stackName);
    if (stack) {
        await cloudformationCalls.deleteStack(stackName);
    }

    // Cleanup uploaded S3 files for service
    const name = {
        bucket: `handel-${accountConfig.region}-${accountConfig.account_id}`,
        prefix: `${serviceContext.appName}/${serviceContext.environmentName}/${serviceContext.serviceName}`
    };
    await s3Calls.deleteMatchingPrefix(name.bucket, name.prefix);

    return new UnDeployContext(serviceContext);
}

export async function unPreDeploySecurityGroup(ownServiceContext: ServiceContext<ServiceConfig>, serviceName: string) {
    const sgName = ownServiceContext.stackName();
    await deleteSecurityGroupForService(sgName);
    return new UnPreDeployContext(ownServiceContext);
}

export async function unBindService(ownServiceContext: ServiceContext<ServiceConfig>, ownPreDeployContext: PreDeployContext, dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: PreDeployContext, protocol: string, port: number | number[]): Promise<UnBindContext> {
    if(ownPreDeployContext.securityGroups.length > 0 && dependentOfPreDeployContext.securityGroups.length > 0) { // Only try to remove ingress if it hasn't been deleted yet
        const ownSg = ownPreDeployContext.securityGroups[0];
        const sourceSg = dependentOfPreDeployContext.securityGroups[0];
        let portsToUnBind: number[];
        if(port instanceof Array) {
            portsToUnBind = port;
        }
        else {
            portsToUnBind = [port];
        }
        for(const portToUnBind of portsToUnBind) {
            await ec2Calls.removeIngressFromSg(sourceSg, ownSg, protocol, portToUnBind, portToUnBind, ownServiceContext.accountConfig.vpc);
        }
    }
    return new UnBindContext(ownServiceContext, dependentOfServiceContext);
}

export async function deleteServiceItemsFromSSMParameterStore(ownServiceContext: ServiceContext<ServiceConfig>, paramsToDelete: string[]): Promise<boolean> {
    const paramsToDeleteFullNames = paramsToDelete.map(paramToDelete => ownServiceContext.ssmParamName(paramToDelete));
    return await ssmCalls.deleteParameters(paramsToDeleteFullNames);
}
