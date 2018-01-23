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
import * as winston from 'winston';
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
    winston.verbose(`Getting security group ${groupName} in VPC ${vpcId}`);
    const describeResults = await awsWrapper.ec2.describeSecurityGroups(describeSgParams);
    if (describeResults.SecurityGroups && describeResults.SecurityGroups.length > 0) {
        winston.verbose(`Found security group ${groupName} in VPC ${vpcId}`);
        return describeResults.SecurityGroups![0];
    }
    else {
        winston.verbose(`Security group ${groupName} does not exist in VPC ${vpcId}`);
        return null;
    }
}

/**
 * Given the ID of a security group and VPC, returns the information about that
 * security group, or null if it doesn't exist.
 */
export async function getSecurityGroupById(groupId: string, vpcId: string): Promise<AWS.EC2.SecurityGroup | null> {
    const describeSgParams = {
        Filters: [
            {
                Name: 'vpc-id',
                Values: [vpcId]
            },
            {
                Name: 'group-id',
                Values: [groupId]
            }
        ]
    };
    winston.verbose(`Getting security group ${groupId} in VPC ${vpcId}`);
    const describeResults = await awsWrapper.ec2.describeSecurityGroups(describeSgParams);
    if (describeResults.SecurityGroups && describeResults.SecurityGroups.length > 0) {
        winston.verbose(`Found security group ${groupId} in VPC ${vpcId}`);
        return describeResults.SecurityGroups[0];
    }
    else {
        winston.verbose(`Security group ${groupId} does not exist in VPC ${vpcId}`);
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
 * Removes all ingress rules from the given security group. It really does remove
 * ALL of them, so be careful where you use this!
 */
export async function removeAllIngressFromSg(sgName: string, vpcId: string): Promise<boolean> {
    const securityGroup = await getSecurityGroup(sgName, vpcId);
    if (securityGroup) {
        const ipPermissionsToRevoke = [];
        for (const ipPermission of securityGroup.IpPermissions!) {
            ipPermissionsToRevoke.push({
                IpProtocol: ipPermission.IpProtocol,
                FromPort: ipPermission.FromPort,
                ToPort: ipPermission.ToPort,
                UserIdGroupPairs: ipPermission.UserIdGroupPairs
            });
        }

        const revokeParam = {
            GroupId: securityGroup.GroupId,
            IpPermissions: ipPermissionsToRevoke
        };
        await awsWrapper.ec2.revokeSecurityGroupIngress(revokeParam);
        return true;
    }
    else {
        return true; // Sg has already been deleted
    }
}

/**
 * Given a security group, adds an ingress rule from the given source security group
 * if that ingress rule doesn't already exist
 */
export async function addIngressRuleToSgIfNotExists(sourceSg: AWS.EC2.SecurityGroup, destSg: AWS.EC2.SecurityGroup,
    protocol: string, startPort: number,
    endPort: number, vpcId: string): Promise<AWS.EC2.SecurityGroup|null> {
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
    endPort: number, vpcId: string): Promise<AWS.EC2.SecurityGroup|null> {
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
    winston.verbose(`Adding ingress rule to security group ${destSg.GroupId} from group ${sourceSg.GroupId}`);
    const authorizeResult = await awsWrapper.ec2.authorizeSecurityGroupIngress(addIngressParams);
    winston.verbose(`Added ingress rule to security group ${destSg.GroupId} from group ${sourceSg.GroupId}`);
    return getSecurityGroup(destSg.GroupName!, vpcId);
}

/**
 * Given an owner (such as 'amazon' or '111111111111'), returns the latest
 * AMI for the given name substring, or null if no such AMI exists
 */
export async function getLatestAmiByName(owner: string, nameSubstring: string): Promise<AWS.EC2.Image|null> {
    const describeParams: AWS.EC2.DescribeImagesRequest = {
        Owners: [owner],
        Filters: [{
            Name: 'name',
            Values: [`*${nameSubstring}*`]
        }]
    };
    winston.verbose(`Getting latest AMI for owner '${owner}' with substring '${nameSubstring}'`);
    const describeResult = await awsWrapper.ec2.describeImages(describeParams);
    const images = describeResult.Images!;
    if (images.length === 0) {
        return null;
    }
    else {
        let latestImage = images[0];
        for (const image of images) {
            const latestDate = new Date(latestImage.CreationDate!);
            const currentDate = new Date(image.CreationDate!);
            if (currentDate > latestDate) {
                latestImage = image;
            }
        }
        winston.verbose(`Found AMI '${latestImage.ImageId}'`);
        return latestImage;
    }
}

export async function getRegions(): Promise<string[]> {
    winston.verbose(`Getting current list of regions`);
    const regionsResponse = await awsWrapper.ec2.describeRegions({});
    return regionsResponse.Regions!.map(item => item.RegionName!);
}

export async function getSubnets(vpcId: string): Promise<AWS.EC2.Subnet[]> {
    winston.verbose(`Getting subnets list for VPC '${vpcId}'`);
    const describeParams = {
        Filters: [
            {
                Name: 'vpc-id',
                Values: [vpcId]
            }
        ]
    };
    const describeResponse = await awsWrapper.ec2.describeSubnets(describeParams);
    return describeResponse.Subnets!;
}

export async function getDefaultVpc(): Promise<AWS.EC2.Vpc> {
    winston.verbose(`Getting default VPC in account`);
    const describeParams = {
        Filters: [
            {
                Name: 'isDefault',
                Values: [
                    'true'
                ]
            }
        ]
    };
    const describeResponse = await awsWrapper.ec2.describeVpcs(describeParams);
    return describeResponse.Vpcs![0];
}
