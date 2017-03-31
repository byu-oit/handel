const iamCalls = require('../aws/iam-calls');
const s3Calls = require('../aws/s3-calls');
const accountConfig = require('../util/account-config')().getAccountConfig();
const fs = require('fs');

/**
 * Given a ServiceContext and suffix, return the env var name used for environment variables naming
 * All dashes are substituted for underscores.
 * 
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to get the prefix for
 * @param {String} suffix - The remaining part of the environment variable
 * @returns {String} - The environment variable prefix string constructed from the service context
 */
exports.getInjectedEnvVarName = function(serviceContext, suffix) {
    return `${serviceContext.serviceType}_${serviceContext.appName}_${serviceContext.environmentName}_${serviceContext.serviceName}_${suffix}`.toUpperCase().replace(/-/g, "_");
}

exports.getEnvVarsFromDependencyDeployContexts = function(deployContexts) {
    let envVars = {};
    for(let deployContext of deployContexts) {
        for(let envVarKey in deployContext.environment_variables) {
            envVars[envVarKey] = deployContext.environment_variables[envVarKey];
        }
    }
    return envVars;
}

exports.createCustomRoleForService = function(trustedService, ownServicePolicyStatement, ownServiceContext, dependenciesDeployContexts) {
    let policyStatementsToConsume = [];

    //Add policies from dependencies that have them
    for(let deployContext of dependenciesDeployContexts) {
        for(let policyDoc of deployContext.policies) {
            policyStatementsToConsume.push(policyDoc);
        }
    }

    //Let consuming service add its own policy if needed
    if(ownServicePolicyStatement) {
        policyStatementsToConsume.push(ownServicePolicyStatement);
    }

    let roleName = `${ownServiceContext.appName}-${ownServiceContext.environmentName}-${ownServiceContext.serviceName}-${ownServiceContext.serviceType}`;
    return iamCalls.createRoleIfNotExists(roleName, trustedService)
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
        });
}

exports.uploadFileToHandelBucket = function(serviceContext, diskFilePath, s3FileName) {
    let bucketName = `handel-${accountConfig.region}-${accountConfig.account_id}`;
    
    return s3Calls.createBucketIfNotExists(bucketName, accountConfig.region) //Ensure Handel bucket exists in this region
        .then(bucket => {
            let artifactKey = `${serviceContext.appName}/${serviceContext.environmentName}/${serviceContext.serviceName}/${s3FileName}`;
            return s3Calls.uploadFile(bucketName, artifactKey, diskFilePath);
        });
}