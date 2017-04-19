const winston = require('winston');
const _ = require('lodash');
const PreDeployContext = require('../datatypes/pre-deploy-context');

exports.preDeployServices = function(serviceDeployers, environmentContext) {
    winston.info(`Executing pre-deploy on services in environment ${environmentContext.environmentName}`);

    let preDeployPromises = [];

     _.forEach(environmentContext.serviceContexts, function(serviceContext) {
        winston.info(`Executing pre-deploy on service ${serviceContext.serviceName}`);
        let serviceDeployer = serviceDeployers[serviceContext.serviceType];
        preDeployPromises.push(serviceDeployer.preDeploy(serviceContext));
    });

    return Promise.all(preDeployPromises)
        .then(preDeployResults => {
            var preDeployContexts = {}
            let i = 0;
            _.forEach(environmentContext.serviceContexts, function(serviceContext) {
                let preDeployContext = preDeployResults[i];
                if(!(preDeployContext instanceof PreDeployContext)) {
                    throw new Error("Expected PreDeployContext as result from 'preDeploy' phase");
                }
                preDeployContexts[serviceContext.serviceName] = preDeployContext
                i++;
            });
            return preDeployContexts;
        })
}
