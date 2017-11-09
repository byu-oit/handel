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
const handlebarsUtils = require('./handlebars-utils');
const cloudformationCalls = require('../aws/cloudformation-calls');
const deployPhaseCommon = require('./deploy-phase-common');
const PreDeployContext = require('../datatypes/pre-deploy-context').PreDeployContext;
const ec2Calls = require('../aws/ec2-calls');
const winston = require('winston');

function createSecurityGroupForService(stackName, sshBastionIngressPort, accountConfig) {
    let sgName = `${stackName}-sg`;
    let handlebarsParams = {
        groupName: sgName,
        vpcId: accountConfig.vpc
    }
    if (sshBastionIngressPort) {
        handlebarsParams.sshBastionSg = accountConfig.ssh_bastion_sg;
        handlebarsParams.sshBastionIngressPort = sshBastionIngressPort;
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/ec2-sg-template.yml`, handlebarsParams)
        .then(compiledTemplate => {
            return cloudformationCalls.getStack(sgName)
                .then(stack => {
                    if (!stack) {
                        return cloudformationCalls.createStack(sgName, compiledTemplate, []);
                    }
                    else {
                        return cloudformationCalls.updateStack(sgName, compiledTemplate, []);
                    }
                });
        })
        .then(deployedStack => {
            let groupId = cloudformationCalls.getOutput('GroupId', deployedStack)
            return ec2Calls.getSecurityGroupById(groupId, accountConfig.vpc);
        });
}

exports.preDeployCreateSecurityGroup = function (serviceContext, sshBastionIngressPort, serviceName) {
    let sgName = deployPhaseCommon.getResourceName(serviceContext);
    winston.info(`${serviceName} - Creating security group '${sgName}'`);

    return createSecurityGroupForService(sgName, sshBastionIngressPort, serviceContext.accountConfig)
        .then(securityGroup => {
            winston.info(`${serviceName} - Finished creating security group '${sgName}'`);
            let preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push(securityGroup);
            return preDeployContext;
        });
}

