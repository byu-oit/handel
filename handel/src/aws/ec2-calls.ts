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
 * Given an owner (such as 'amazon' or '111111111111'), returns the latest
 * AMI for the given name substring, or null if no such AMI exists
 */
export async function getLatestAmiByName(owner: string, nameSubstring: string): Promise<AWS.EC2.Image | null> {
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

export async function getSubnet(subnetId: string): Promise<AWS.EC2.Subnet | null> {
    winston.verbose(`Getting subnet '${subnetId}'`);
    const describeParams = {
        SubnetIds: [subnetId]
    };

    try {
        const describeResponse = await awsWrapper.ec2.describeSubnets(describeParams);
        if (describeResponse.Subnets && describeResponse.Subnets[0]) {
            return describeResponse.Subnets[0];
        }
        else {
            return null;
        }
    }
    catch(err) {
        if(err.code === 'InvalidSubnetID.NotFound') { // The subnet doesn't exist
            return null;
        }
        throw err; // Don't handle any other errors
    }
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

export async function shouldAssignPublicIp(subnetIds: string[]): Promise<boolean> {
    const subnetsAssignPublicIp = [];
    for(const subnetId of subnetIds) {
        const subnet = await getSubnet(subnetId);
        if(!subnet) {
            throw new Error(`The subnet '${subnetId}' from your account config file could not be found`);
        }
        subnetsAssignPublicIp.push(subnet.MapPublicIpOnLaunch);
    }
    const allAssignIpvaluesSame = subnetsAssignPublicIp.every( (val, i, arr) => val === arr[0] );
    if(!allAssignIpvaluesSame) {
        throw new Error(`You cannot mix public and private subnets in each subnets section in the Handel account config file.`);
    }

    return subnetsAssignPublicIp[0] ? true : false;
}
