const winston = require('winston');
const UnPreDeployContext = require('../datatypes/un-pre-deploy-context');

exports.unPreDeployServices = function(serviceDeployers, environmentContext) {
    winston.info(`Executing UnPreDeploy on services in environment ${environmentContext.environmentName}`);
    let unPreDeployPromises = [];
    let unPreDeployContexts = {};

    for(let serviceName in environmentContext.serviceContexts) {
        let serviceContext = environmentContext.serviceContexts[serviceName];
        winston.info(`Executing UnPreDeploy on service ${serviceName}`);
        let serviceDeployer = serviceDeployers[serviceContext.serviceType];
        let unPreDeployPromise = serviceDeployer.unPreDeploy(serviceContext)
            .then(unPreDeployContext => {
                if(!(unPreDeployContext instanceof UnPreDeployContext)) {
                    throw new Error("Expected PreDeployContext as result from 'preDeploy' phase");
                }
                unPreDeployContexts[serviceContext.serviceName] = unPreDeployContext;
            });
        unPreDeployPromises.push(unPreDeployPromise);
    }

    return Promise.all(unPreDeployPromises)
        .then(() => {
            return unPreDeployContexts; //This was built up dynamically above
        });
}