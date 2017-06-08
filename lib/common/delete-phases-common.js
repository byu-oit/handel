const accountConfig = require('../common/account-config')().getAccountConfig();
const ec2Calls = require('../aws/ec2-calls');
const cloudformationCalls = require('../aws/cloudformation-calls');
const winston = require('winston');
const UnDeployContext = require('../datatypes/un-deploy-context');
const deployPhaseCommon = require('./deploy-phase-common');

exports.unBindAllOnSg = function (stackName) {
    let sgName = `${stackName}-sg`;
    return ec2Calls.removeAllIngressFromSg(sgName, accountConfig.vpc)
        .then(() => {
            return true;
        });
}

exports.deleteSecurityGroupForService = function (stackName) {
    let sgName = `${stackName}-sg`;
    return cloudformationCalls.getStack(sgName)
        .then(stack => {
            if (stack) {
                return cloudformationCalls.deleteStack(sgName)
            }
            else {
                return true;
            }
        });
}

exports.unDeployCloudFormationStack = function (serviceContext, serviceType) {
    let stackName = deployPhaseCommon.getResourceName(serviceContext);
    winston.info(`${serviceType} - Executing UnDeploy on '${stackName}'`)

    return cloudformationCalls.getStack(stackName)
        .then(stack => {
            if (stack) {
                winston.info(`${serviceType} - Deleting stack '${stackName}'`);
                return cloudformationCalls.deleteStack(stackName);
            }
            else {
                winston.info(`${serviceType} - Stack '${stackName}' has already been deleted`);
            }
        })
        .then(() => {
            return new UnDeployContext(serviceContext);
        });
}