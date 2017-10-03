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
const ec2Calls = require('../aws/ec2-calls');
const stsCalls = require('../aws/sts-calls');
const cloudFormationCalls = require('../aws/cloudformation-calls');
const handlebarsUtils = require('../common/handlebars-utils');
const winston = require('winston');
const AWS = require('aws-sdk');

function getSubnetGroupName(vpcId) {
    return `handel-${vpcId}`
}

function isValidRegion(region) {
    return ec2Calls.getRegions()
        .then(regions => {
            return regions.includes(region);
        });
}

function getDefaultVpcSubnets(vpcId) {
    return ec2Calls.getSubnets(vpcId)
        .then(subnets => {
            return subnets.map(subnet => subnet.SubnetId)
        });
}

function getSubnetGroups(vpcId, subnetIds) {
    const stackName = getSubnetGroupName(vpcId);
    let handlebarsParams = {
        stackName,
        subnetGroupDescription: 'Handel-created subnet group for Default VPC',
        subnetIds
    }
    return handlebarsUtils.compileTemplate(`${__dirname}/default-vpc-subnet-groups-template.yml`, handlebarsParams)
        .then(compiledTemplate => {
            return cloudFormationCalls.getStack(stackName)
                .then(stack => {
                    if(!stack) {
                        winston.info(`Creating subnet groups for default VPC`);
                        return cloudFormationCalls.createStack(stackName, compiledTemplate, [], null)
                            .then(cfStack => {
                                winston.info(`Created subnet groups for default VPC`);
                                return cfStack;
                            });
                    }
                    else {
                        return stack;
                    }
                });
        });
}

exports.getDefaultAccountConfig = function (accountConfigParam) {
    let region = accountConfigParam.substring(accountConfigParam.indexOf('-') + 1);
    return isValidRegion(region)
        .then(valid => {
            if (valid) {
                //Set region so we can make calls to get the account VPC config (this will be set again later)
                AWS.config.update({
                    region,
                    maxRetries: 10
                });
                return ec2Calls.getDefaultVpc()
                    .then(defaultVpc => {
                        return {
                            region,
                            vpc: defaultVpc.VpcId
                        }
                    })
            }
            else {
                throw new Error(`Invalid region: '${region}'`);
            }
        })
        .then(accountConfig => {
            return stsCalls.getAccountId()
                .then(accountId => {
                    accountConfig.account_id = parseInt(accountId);
                    return accountConfig;
                });
        })
        .then(accountConfig => {
            return getDefaultVpcSubnets(accountConfig.vpc)
                .then(subnets => {
                    //The default VPC only has three public subnets, so we just have to use those for all the different tiers Handel supports
                    accountConfig.public_subnets = subnets;
                    accountConfig.private_subnets = subnets;
                    accountConfig.data_subnets = subnets;
                    return accountConfig;
                });
        })
        .then(accountConfig => {
            return getSubnetGroups(accountConfig.vpc, accountConfig.data_subnets)
                .then(cfStack => {
                    accountConfig.rds_subnet_group = cloudFormationCalls.getOutput("RdsSubnetGroupName", cfStack);
                    accountConfig.elasticache_subnet_group = cloudFormationCalls.getOutput("ElastiCacheSubnetGroupName", cfStack);
                    return accountConfig;
                });
        });
}