const winston = require('winston');
const ec2Calls = require('../../aws/ec2-calls');
let accountConfig = require('../../util/config')().getAccountConfig();

/**
 * Checks the service parameters for the deployable service in order to provide a 
 * fail-fast mechanism 
 */
exports.check = function(serviceContext) {
    winston.error("Check ECS -- NOT IMPLEMENTED");
    return [];
    //Returns checkContext
}

/**
 * 
 */
exports.preDeploy = function(serviceContext) {
    let sg_name = `${serviceContext.appName}_${serviceContext.environmentName}_${serviceContext.serviceName}_${serviceContext.serviceType}`;
    return ec2Calls.createSecurityGroupIfNotExists(sg_name, accountConfig['vpc'])
        .then(securityGroup => {
            return {
                serviceName: serviceContext.serviceName,
                serviceType: serviceContext.serviceType,
                securityGroups: [ securityGroup ]
            }
        });
}

//Don't use this to create resources
exports.bind = function(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    return Promise.resolve();
}

/**
 * Deploy the instance of the service based on the service params passed in.
 */
exports.deploy = function(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    //TODO - Deploy this EFS
    return Promise.resolve();
}