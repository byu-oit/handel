const iamCalls = require('../aws/iam-calls');
const ec2Calls = require('../aws/ec2-calls');
const accountConfig = require('../util/account-config')().getAccountConfig();

exports.createCustomRoleForECSService = function(ownServiceContext, dependenciesDeployContexts) {
    let policyStatementsToConsume = []
    for(let deployContext of dependenciesDeployContexts) {
        for(let policyDoc of deployContext.policies) {
            policyStatementsToConsume.push(policyDoc);
        }
    }

    let roleName = `${ownServiceContext.appName}-${ownServiceContext.environmentName}-${ownServiceContext.serviceName}-efs`;
    return iamCalls.createRoleIfNotExists(roleName, "ecs-tasks.amazonaws.com")
        .then(role => {
            let policyArn = `arn:aws:iam::${accountConfig.account_id}:policy/services/${roleName}`;
            let policyDocument = iamCalls.getPolicyDocumentForMultiplePolicyStatements(policyStatementsToConsume);
            return iamCalls.createOrUpdatePolicy(roleName, policyArn, policyDocument);
        })
        .then(policy => {
            return iamCalls.attachPolicyToRoleIfNeeded(policy.Arn, roleName);
        })
        .then(policyAttachment => {
            return iamCalls.getRole(roleName);
        });
}