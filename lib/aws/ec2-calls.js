const AWS = require('aws-sdk');
const winston = require('winston');


/**
 * Creates the service group with the given name if it doesn't exist already
 * 
 * The group created here does not have any ingress rules at first. Those must be
 * manually added
 * 
 * @param {String} groupName - The name of the security group that will be created
 * @param {String} vpcId - The ID of the VPC in which to create the security group
 * @returns {Promise.<SecurityGroup>} - A Promise of the Security group
 */
exports.createSecurityGroupIfNotExists = function(groupName, vpcId) {
    return exports.getSecurityGroup(groupName, vpcId)
        .then(securityGroup => {
            if(securityGroup) {
                return securityGroup;
            }
            else {
                return exports.createSecurityGroup(groupName, vpcId);
            }
        });
}


/**
 * Creates the service group with the given name if it doesn't exist already
 * 
 * The group created here does not have any ingress rules at first. Those must be
 * manually added
 * 
 * @param {String} groupName - The name of the security group that will be created
 * @param {String} vpcId - The ID of the VPC in which to create the security group
 * @returns {Promise.<SecurityGroup>} - A Promise of the Security group
 */
exports.createSecurityGroup = function(groupName, vpcId) {
    const ec2 = new AWS.EC2({
        apiVersion: '2016-11-15'
    });
    let createSgParams = {
        Description: groupName,
        GroupName: groupName,
        VpcId: vpcId
    }
    winston.debug(`Creating security group ${groupName} in VPC ${vpcId}`);
    return ec2.createSecurityGroup(createSgParams).promise()
        .then(createResult => {
            winston.debug(`Created security group ${groupName} in VPC ${vpcId}`);
            return exports.getSecurityGroup(groupName, vpcId)
                .then(securityGroup => {
                    if(securityGroup) {
                        return securityGroup;
                    }
                    else {
                        throw new Error(`Couldn't find created security group ${groupName}`);
                    }
                });
        })
        .then(securityGroup => {
            return exports.tagResource(securityGroup['GroupId'], [
                {
                    Key: "Name",
                    Value: securityGroup['GroupName']
                }
            ])
            .then(tagResult => {
                return securityGroup;
            })
        });
}


/**
 * Returns the information about the requested security group if it exists.
 * 
 * @param {String} groupName - The name of the security group to search for
 * @param {String} vpcId - The ID of the VPC in which to look for the security group
 * @returns {Promise.<SecurityGroup>} - A Promise of the security group information, or null if none exists
 */
exports.getSecurityGroup = function(groupName, vpcId) {
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
            if(describeResults['SecurityGroups'].length > 0) {
                winston.debug(`Found security group ${groupName} in VPC ${vpcId}`);
                return describeResults['SecurityGroups'][0];
            }
            else {
                winston.debug(`Security group ${groupName} does not exist in VPC ${vpcId}`);
                return null;
            }
        });
}

exports.getSecurityGroupById = function(groupId, vpcId) {
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
            if(describeResults['SecurityGroups'].length > 0) {
                winston.debug(`Found security group ${groupId} in VPC ${vpcId}`);
                return describeResults['SecurityGroups'][0];
            }
            else {
                winston.debug(`Security group ${groupId} does not exist in VPC ${vpcId}`);
                return null;
            }
        });
}


//TODO - Document this
exports.tagResource = function(resourceId, tags) {
    const ec2 = new AWS.EC2({
        apiVersion: '2016-11-15'
    });
    var tagParams = {
        Resources: [
            resourceId
        ], 
        Tags: tags
    };
    winston.debug(`Tagging EC2 resource ${resourceId}`);
    return ec2.createTags(tagParams).promise();
}

exports.ingressRuleExists = function(securityGroup, startPort, endPort, protocol, sourceSg) {
    let ingressRuleExists = false;
    for(let ingressRule of securityGroup['IpPermissions']) {
        if(ingressRule['FromPort'] == startPort && ingressRule['ToPort'] == endPort && ingressRule['IpProtocol'] === protocol) {
            for(let ingressRuleSource of ingressRule['UserIdGroupPairs']) {
                if(ingressRuleSource['GroupId'] === sourceSg['GroupId']) {
                    ingressRuleExists = true;
                    break;
                }
            }
        }
    }
    return ingressRuleExists;
}

exports.addIngressRuleToSgIfNotExists = function(sourceSg, destSg, 
                                                 protocol, startPort, 
                                                 endPort, vpcId) {
    return exports.getSecurityGroup(destSg['GroupName'], destSg['VpcId'])
        .then(securityGroup => {
            if(securityGroup) {
                if(!exports.ingressRuleExists(securityGroup, startPort, endPort, protocol, sourceSg)) {
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
exports.addIngressRuleToSecurityGroup = function(sourceSg, destSg, 
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