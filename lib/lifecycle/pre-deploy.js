const winston = require('winston');
const _ = require('lodash');
const PreDeployContext = require('../datatypes/pre-deploy-context');

exports.preDeployServices = function(serviceDeployers, environmentContext) {
    winston.info(`Executing pre-deploy on services in environment ${environmentContext.environmentName}`);
    let preDeployPromises = [];
    let preDeployContexts = {};

     _.forEach(environmentContext.serviceContexts, function(serviceContext) {
        winston.info(`Executing pre-deploy on service ${serviceContext.serviceName}`);
        let serviceDeployer = serviceDeployers[serviceContext.serviceType];
        let preDeployPromise = serviceDeployer.preDeploy(serviceContext)
            .then(preDeployContext => {
                if(!(preDeployContext instanceof PreDeployContext)) {
                    throw new Error("Expected PreDeployContext as result from 'preDeploy' phase");
                }
                preDeployContexts[serviceContext.serviceName] = preDeployContext;
            });
        preDeployPromises.push(preDeployPromise);
    });

    return Promise.all(preDeployPromises)
        .then(() => {
            return preDeployContexts; //This was built up dynamically above
        });
}
