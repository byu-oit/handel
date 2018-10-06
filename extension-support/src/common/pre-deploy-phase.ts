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
    AccountConfig,
    PreDeployContext,
    ServiceConfig,
    ServiceContext,
    Tags
} from 'handel-extension-api';
import * as cloudformationCalls from '../aws/cloudformation-calls';
import * as ec2Calls from '../aws/ec2-calls';
import * as handlebarsUtils from '../util/handlebars-utils';
import * as deployPhase from './deploy-phase';
import { getTags } from './tagging';

function getSgStackName(ownServiceContext: ServiceContext<ServiceConfig>) {
    return `${ownServiceContext.stackName()}-sg`;
}

async function createSecurityGroupForService(sgName: string, sshBastionIngressPort: number | null, serviceContext: ServiceContext<ServiceConfig>, tags: Tags) {
    const accountConfig = serviceContext.accountConfig;
    const handlebarsParams: any = {
        groupName: sgName,
        vpcId: accountConfig.vpc
    };
    if (sshBastionIngressPort) {
        handlebarsParams.sshBastionSg = accountConfig.ssh_bastion_sg;
        handlebarsParams.sshBastionIngressPort = sshBastionIngressPort;
    }

    // Compile and upload template
    const compiledTemplate = await handlebarsUtils.compileTemplate(`${__dirname}/ec2-sg-template.yml`, handlebarsParams);
    const s3ObjectData = await deployPhase.uploadCFTemplateToHandelBucket(serviceContext, compiledTemplate);

    // Create/update stack
    const stack = await cloudformationCalls.getStack(sgName);
    let deployedStack;
    if (!stack) {
        deployedStack = await cloudformationCalls.createStack(sgName, s3ObjectData.Location, [], 30, tags);
    }
    else {
        deployedStack = await cloudformationCalls.updateStack(sgName, s3ObjectData.Location, [], tags);
    }
    const groupId = cloudformationCalls.getOutput('GroupId', deployedStack);
    return ec2Calls.getSecurityGroupById(groupId!, accountConfig.vpc);
}

export async function preDeployCreateSecurityGroup(serviceContext: ServiceContext<ServiceConfig>, sshBastionIngressPort: number | null, serviceName: string): Promise<PreDeployContext> {
    const sgName = getSgStackName(serviceContext);
    const securityGroup = await createSecurityGroupForService(sgName, sshBastionIngressPort, serviceContext, getTags(serviceContext));
    if(!securityGroup) {
        throw new Error(`Did not get back security group '${sgName}' after creating it`);
    }
    const preDeployContext = new PreDeployContext(serviceContext);
    preDeployContext.securityGroups.push(securityGroup);
    return preDeployContext;
}

export async function getSecurityGroup(serviceContext: ServiceContext<ServiceConfig>): Promise<PreDeployContext> {
    const preDeployContext = new PreDeployContext(serviceContext);
    const accountConfig = serviceContext.accountConfig;
    const sgName = getSgStackName(serviceContext);
    const stack = await cloudformationCalls.getStack(sgName);
    if(stack) {
        const groupId = cloudformationCalls.getOutput('GroupId', stack);
        if(!groupId) {
            throw new Error('CloudFormation stack didnt return security group id');
        }
        const securityGroup = await ec2Calls.getSecurityGroupById(groupId, accountConfig.vpc);
        if(!securityGroup) {
            throw new Error('Could not find security group referenced in CloudFormation stack. Was it deleted manually outside of CloudFormation?');
        }
        preDeployContext.securityGroups.push(securityGroup);
    }
    return preDeployContext;
}
