const winston = require('winston');
const ec2Calls = require('../../aws/ec2-calls');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
let accountConfig = require('../../util/account-config')().getAccountConfig();


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
            let preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push(securityGroup);
            return preDeployContext;
        });
}

//Don't use this to create resources
exports.bind = function(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    //TODO - NOT IMPLEMENTED YET
    return new Promise((resolve, reject) => {
        resolve(new BindContext(ownServiceContext));
    })
}

/**
 * Deploy the instance of the service based on the service params passed in.
 */
exports.deploy = function(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    //TODO - Deploy this EFS
    return new Promise((resolve, reject) => {
        resolve(new DeployContext(ownServiceContext));
    })
}