const winston = require('winston');

/**
 * Checks the service parameters for the deployable service in order to provide a 
 * fail-fast mechanism 
 */
exports.check = function(serviceContext) {
    winston.error("Check EFS -- NOT IMPLEMENTED");
    return [];
    //Returns checkContext
}

exports.preDeploy = function(serviceContext) {
    winston.error("PreDeploy EFS -- NOT IMPLEMENTED");
    return {
        "PreDeploy": "Hello"
    }
    // return {}; //Noop, no resources required in predeploy?
    //Returns preDeployContext
}

exports.bind = function(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.error("Bind EFS -- NOT IMPLEMENTED");
    // return {}; //Noop, nothing done by Dynamo in bind
    return new Promise((resolve, reject) => {
        setTimeout(function() {
            winston.info("Finished Bind EFS");
            resolve();
        }, 5000);
    });
    //Return bindContext
}

/**
 * Deploy the instance of the service based on the service params passed in.
 */
exports.deploy = function(ownServiceContext, ownPreDeployContext, ownBindContext, dependenciesDeployContexts) {
    winston.error("Deploy EFS -- NOT IMPLEMENTED");
    return new Promise((resolve, reject) => {
        setTimeout(function() {
            winston.info("Finished Deploy EFS");
            resolve();
        }, 5000);
    });
    //Return deployContext
}