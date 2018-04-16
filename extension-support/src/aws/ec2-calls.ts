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
import * as AWS from 'aws-sdk';
import awsWrapper from './aws-wrapper';

/**
 * Returns the information about the requested security group if it exists.
 */
export async function getSecurityGroup(groupName: string, vpcId: string): Promise<AWS.EC2.SecurityGroup | null> {
    const describeSgParams: AWS.EC2.DescribeSecurityGroupsRequest = {
        Filters: [
            {
                Name: 'vpc-id',
                Values: [vpcId]
            },
            {
                Name: 'group-name',
                Values: [groupName]
            }
        ]
    };
    const describeResults = await awsWrapper.ec2.describeSecurityGroups(describeSgParams);
    if (describeResults.SecurityGroups && describeResults.SecurityGroups.length > 0) {
        return describeResults.SecurityGroups![0];
    }
    else {
        return null;
    }
}

/**
 * Given a security group, determines whether the given combination of protocol, start port,
 * end port, and source already exists as an ingress rule on the security group
 */
export function ingressRuleExists(securityGroup: AWS.EC2.SecurityGroup, startPort: number, endPort: number, protocol: string, sourceSg: AWS.EC2.SecurityGroup): boolean {
    let exists = false;
    for (const ingressRule of securityGroup.IpPermissions!) {
        if (ingressRule.FromPort === startPort && ingressRule.ToPort === endPort && ingressRule.IpProtocol === protocol) {
            for (const ingressRuleSource of ingressRule.UserIdGroupPairs!) {
                if (ingressRuleSource.GroupId === sourceSg.GroupId) {
                    exists = true;
                    break;
                }
            }
        }
    }
    return exists;
}

/**
 * Given a security group, adds an ingress rule from the given source security group
 * if that ingress rule doesn't already exist
 */
export async function addIngressRuleToSgIfNotExists(sourceSg: AWS.EC2.SecurityGroup, destSg: AWS.EC2.SecurityGroup,
    protocol: string, startPort: number,
    endPort: number, vpcId: string): Promise<AWS.EC2.SecurityGroup | null> {
    const securityGroup = await getSecurityGroup(destSg.GroupName!, destSg.VpcId!);
    if (securityGroup) {
        if (!ingressRuleExists(securityGroup, startPort, endPort, protocol, sourceSg)) {
            return addIngressRuleToSecurityGroup(sourceSg, destSg, protocol, startPort, endPort, vpcId);
        }
        else {
            return destSg;
        }
    }
    else {
        throw new Error('addIngressRuleToSgIfNotExists - missing security group');
    }
}

/**
 * Adds an ingress rule from the given source security group to the given
 * destination security group
 */
export async function addIngressRuleToSecurityGroup(sourceSg: AWS.EC2.SecurityGroup, destSg: AWS.EC2.SecurityGroup,
    protocol: string, startPort: number,
    endPort: number, vpcId: string): Promise<AWS.EC2.SecurityGroup | null> {
    const addIngressParams: AWS.EC2.AuthorizeSecurityGroupIngressRequest = {
        GroupId: destSg.GroupId,
        IpPermissions: [
            {
                IpProtocol: protocol,
                FromPort: startPort,
                ToPort: endPort,
                UserIdGroupPairs: [
                    {
                        GroupId: sourceSg.GroupId,
                        VpcId: vpcId
                    }
                ]
            }
        ]
    };
    const authorizeResult = await awsWrapper.ec2.authorizeSecurityGroupIngress(addIngressParams);
    return getSecurityGroup(destSg.GroupName!, vpcId);
}
