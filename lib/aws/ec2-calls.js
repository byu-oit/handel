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
const AWS = require('aws-sdk');
const winston = require('winston');

/**
 * Returns the information about the requested security group if it exists.
 * 
 * @param {String} groupName - The name of the security group to search for
 * @param {String} vpcId - The ID of the VPC in which to look for the security group
 * @returns {Promise.<SecurityGroup>} - A Promise of the security group information, or null if none exists
 */
exports.getSecurityGroup = function (groupName, vpcId) {
    const ec2 = new AWS.EC2({
        apiVersion: '2016-11-15'
    });
    let describeSgParams = {
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
    }
    winston.debug(`Getting security group ${groupName} in VPC ${vpcId}`);
    return ec2.describeSecurityGroups(describeSgParams).promise()
        .then(describeResults => {
            if (describeResults['SecurityGroups'].length > 0) {
                winston.debug(`Found security group ${groupName} in VPC ${vpcId}`);
                return describeResults['SecurityGroups'][0];
            }
            else {
                winston.debug(`Security group ${groupName} does not exist in VPC ${vpcId}`);
                return null;
            }
        });
}

exports.getSecurityGroupById = function (groupId, vpcId) {
    const ec2 = new AWS.EC2({
        apiVersion: '2016-11-15'
    });
    let describeSgParams = {
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
    }
    winston.debug(`Getting security group ${groupId} in VPC ${vpcId}`);
    return ec2.describeSecurityGroups(describeSgParams).promise()
        .then(describeResults => {
            if (describeResults['SecurityGroups'].length > 0) {
                winston.debug(`Found security group ${groupId} in VPC ${vpcId}`);
                return describeResults['SecurityGroups'][0];
            }
            else {
                winston.debug(`Security group ${groupId} does not exist in VPC ${vpcId}`);
                return null;
            }
        });
}

exports.ingressRuleExists = function (securityGroup, startPort, endPort, protocol, sourceSg) {
    let ingressRuleExists = false;
    for (let ingressRule of securityGroup['IpPermissions']) {
        if (ingressRule['FromPort'] == startPort && ingressRule['ToPort'] == endPort && ingressRule['IpProtocol'] === protocol) {
            for (let ingressRuleSource of ingressRule['UserIdGroupPairs']) {
                if (ingressRuleSource['GroupId'] === sourceSg['GroupId']) {
                    ingressRuleExists = true;
                    break;
                }
            }
        }
    }
    return ingressRuleExists;
}

exports.removeAllIngressFromSg = function (sgName, vpcId) {
    const ec2 = new AWS.EC2({
        apiVersion: '2016-11-15'
    });
    return exports.getSecurityGroup(sgName, vpcId)
        .then(sg => {
            if (sg) {
                let ipPermissionsToRevoke = [];
                for (let ipPermission of sg.IpPermissions) {
                    ipPermissionsToRevoke.push({
                        IpProtocol: ipPermission.IpProtocol,
                        FromPort: ipPermission.FromPort,
                        ToPort: ipPermission.ToPort,
                        UserIdGroupPairs: ipPermission.UserIdGroupPairs
                    });
                }

                var revokeParam = {
                    GroupId: sg.GroupId,
                    IpPermissions: ipPermissionsToRevoke
                };
                return ec2.revokeSecurityGroupIngress(revokeParam).promise()
                    .then(result => {
                        return true;
                    });
            }
            else {
                return true; //Sg has already been deleted
            }
        });
}

exports.addIngressRuleToSgIfNotExists = function (sourceSg, destSg,
    protocol, startPort,
    endPort, vpcId) {
    return exports.getSecurityGroup(destSg['GroupName'], destSg['VpcId'])
        .then(securityGroup => {
            if (securityGroup) {
                if (!exports.ingressRuleExists(securityGroup, startPort, endPort, protocol, sourceSg)) {
                    return exports.addIngressRuleToSecurityGroup(sourceSg, destSg,
                        protocol, startPort,
                        endPort, vpcId);
                }
                else {
                    return destSg;
                }
            }
            else {
                throw new Error("addIngressRuleToSgIfNotExists - missing security group");
            }
        });
}


//TODO - Document this
exports.addIngressRuleToSecurityGroup = function (sourceSg, destSg,
    protocol, startPort,
    endPort, vpcId) {
    const ec2 = new AWS.EC2({
        apiVersion: '2016-11-15'
    });
    var addIngressParams = {
        GroupId: destSg['GroupId'],
        IpPermissions: [
            {
                IpProtocol: protocol,
                FromPort: startPort,
                ToPort: endPort,
                UserIdGroupPairs: [
                    {
                        GroupId: sourceSg['GroupId'],
                        VpcId: vpcId
                    }
                ]
            }
        ]
    };
    winston.debug(`Adding ingress rule to security group ${destSg.GroupId} from group ${sourceSg.GroupId}`);
    return ec2.authorizeSecurityGroupIngress(addIngressParams).promise()
        .then(authorizeResult => {
            winston.debug(`Added ingress rule to security group ${destSg.GroupId} from group ${sourceSg.GroupId}`);
            return exports.getSecurityGroup(destSg['GroupName'], vpcId);
        });
}