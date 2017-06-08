const handlebarsUtils = require('../common/handlebars-utils');
const cloudformationCalls = require('../aws/cloudformation-calls');
const accountConfig = require('../common/account-config')().getAccountConfig();
const ec2Calls = require('../aws/ec2-calls');

exports.createSecurityGroupForService = function (stackName, sshBastionIngressPort) {
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