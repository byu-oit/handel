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
import * as cloudformationCalls from '../aws/cloudformation-calls';
import * as ec2Calls from '../aws/ec2-calls';
import { AccountConfig, PreDeployContext, ServiceConfig, ServiceContext } from '../datatypes';
import * as deployPhaseCommon from './deploy-phase-common';
import * as handlebarsUtils from './handlebars-utils';

async function createSecurityGroupForService(stackName: string, sshBastionIngressPort: number | null, accountConfig: AccountConfig) {
    const sgName = `${stackName}-sg`;
    const handlebarsParams: any = {
        groupName: sgName,
        vpcId: accountConfig.vpc
    };
    if (sshBastionIngressPort) {
        handlebarsParams.sshBastionSg = accountConfig.ssh_bastion_sg;
        handlebarsParams.sshBastionIngressPort = sshBastionIngressPort;
    }

    const compiledTemplate = await handlebarsUtils.compileTemplate(`${__dirname}/ec2-sg-template.yml`, handlebarsParams);
    const stack = await cloudformationCalls.getStack(sgName);
    let deployedStack;
    if (!stack) {
        deployedStack = await cloudformationCalls.createStack(sgName, compiledTemplate, [], {});
    }
    else {
        deployedStack = await cloudformationCalls.updateStack(sgName, compiledTemplate, [], {});
    }
    const groupId = cloudformationCalls.getOutput('GroupId', deployedStack);
    return ec2Calls.getSecurityGroupById(groupId!, accountConfig.vpc);
}

export async function preDeployCreateSecurityGroup(serviceContext: ServiceContext<ServiceConfig>, sshBastionIngressPort: number | null, serviceName: string) {
    const sgName = deployPhaseCommon.getResourceName(serviceContext);
    winston.info(`${serviceName} - Creating security group '${sgName}'`);

    const securityGroup = await createSecurityGroupForService(sgName, sshBastionIngressPort, serviceContext.accountConfig);
    winston.info(`${serviceName} - Finished creating security group '${sgName}'`);
    const preDeployContext = new PreDeployContext(serviceContext);
    preDeployContext.securityGroups.push(securityGroup!);
    return preDeployContext;
}
