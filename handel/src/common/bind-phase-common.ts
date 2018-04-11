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
import { BindContext, PreDeployContext, } from 'handel-extension-api';
import * as winston from 'winston';
import * as ec2Calls from '../aws/ec2-calls';
import { ServiceConfig, ServiceContext } from '../datatypes';
import * as deployPhaseCommon from './deploy-phase-common';

export async function bindDependentSecurityGroupToSelf(
    ownServiceContext: ServiceContext<ServiceConfig>, ownPreDeployContext: PreDeployContext,
    dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: PreDeployContext, protocol: string,
    port: number, serviceName: string
) {
    const stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${serviceName} - Binding security group from '${dependentOfServiceContext.serviceName}' to '${ownServiceContext.serviceName}'`);
    const ownSg = ownPreDeployContext.securityGroups[0];
    const sourceSg = dependentOfPreDeployContext.securityGroups[0];

    const securityGroup = await ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, ownSg, protocol, port, port, ownServiceContext.accountConfig.vpc);
    winston.info(`${serviceName} - Finished binding security group from '${dependentOfServiceContext.serviceName}' to '${ownServiceContext.serviceName}'`);
    return new BindContext(ownServiceContext, dependentOfServiceContext);
}
