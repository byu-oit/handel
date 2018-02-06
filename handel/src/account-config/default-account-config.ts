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
import * as cloudFormationCalls from '../aws/cloudformation-calls';
import * as ec2Calls from '../aws/ec2-calls';
import * as stsCalls from '../aws/sts-calls';
import * as handlebarsUtils from '../common/handlebars-utils';
import { AccountConfig } from '../datatypes';

function getSubnetGroupName(vpcId: string): string {
    return `handel-subnet-groups-${vpcId}`;
}

async function isValidRegion(region: string) {
    const regions = await ec2Calls.getRegions();
    return regions.includes(region);
}

async function getDefaultVpcSubnets(vpcId: string) {
    const subnets = await ec2Calls.getSubnets(vpcId);
    return subnets.map(subnet => subnet.SubnetId);
}

async function getSubnetGroups(vpcId: string, subnetIds: string[]): Promise<AWS.CloudFormation.Stack> {
    const stackName = getSubnetGroupName(vpcId);
    const handlebarsParams = {
        stackName,
        subnetGroupDescription: 'Handel-created subnet group for Default VPC',
        subnetIds
    };
    const compiledTemplate = await handlebarsUtils.compileTemplate(`${__dirname}/default-vpc-subnet-groups-template.yml`, handlebarsParams);
    const stack = await cloudFormationCalls.getStack(stackName);
    if (!stack) {
        winston.info(`Creating subnet groups for default VPC`);
        const cfStack = await cloudFormationCalls.createStack(stackName, compiledTemplate, [], {});
        winston.info(`Created subnet groups for default VPC`);
        return cfStack;
    }
    else {
        return stack;
    }
}

export async function getDefaultAccountConfig(accountConfigParam: any): Promise<AccountConfig> {
    const region = accountConfigParam.substring(accountConfigParam.indexOf('-') + 1);
    const valid = await isValidRegion(region);
    if (valid) {
        // Set region so we can make calls to get the account VPC config (this will be set again later)
        AWS.config.update({
            region
        });
        const defaultVpc = await ec2Calls.getDefaultVpc();
        const accountConfig: any = {
            region,
            vpc: defaultVpc.VpcId
        };

        const accountId = await stsCalls.getAccountId();
        accountConfig.account_id = parseInt(accountId!, 10);

        const subnets = await getDefaultVpcSubnets(accountConfig.vpc);
        // The default VPC only has three public subnets, so we just have to use those for all the different tiers Handel supports
        accountConfig.public_subnets = subnets;
        accountConfig.private_subnets = subnets;
        accountConfig.data_subnets = subnets;

        const cfStack = await getSubnetGroups(accountConfig.vpc, accountConfig.data_subnets);
        accountConfig.rds_subnet_group = cloudFormationCalls.getOutput('RdsSubnetGroupName', cfStack);
        accountConfig.elasticache_subnet_group = cloudFormationCalls.getOutput('ElastiCacheSubnetGroupName', cfStack);
        return accountConfig as AccountConfig;
    }
    else {
        throw new Error(`Invalid region: '${region}'`);
    }
}
