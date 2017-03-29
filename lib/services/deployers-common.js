const iamCalls = require('../aws/iam-calls');
const accountConfig = require('../util/account-config')().getAccountConfig();

exports.createCustomRoleForService = function(ownServiceContext, dependenciesDeployContexts) {
    let policyStatementsToConsume = []
    for(let deployContext of dependenciesDeployContexts) {
        for(let policyDoc of deployContext.policies) {
            policyStatementsToConsume.push(policyDoc);
        }
    }

    let roleName = `${ownServiceContext.appName}-${ownServiceContext.environmentName}-${ownServiceContext.serviceName}-efs`;
    return iamCalls.createRoleIfNotExists(roleName, "ecs-tasks.amazonaws.com")
        .then(role => {
            if(policyStatementsToConsume.length > 0) { //Only add policies if there are any to consume
                let policyArn = `arn:aws:iam::${accountConfig.account_id}:policy/services/${roleName}`;
                let policyDocument = iamCalls.constructPolicyDoc(policyStatementsToConsume);
                return iamCalls.createOrUpdatePolicy(roleName, policyArn, policyDocument)
                    .then(policy => {
                        return iamCalls.attachPolicyToRole(policy.Arn, roleName);
                    })
                    .then(policyAttachment => {
                        return iamCalls.getRole(roleName);
                    });
            }
            else { //No policies on the role
                return iamCalls.getRole(roleName);
            }
        })
        
}