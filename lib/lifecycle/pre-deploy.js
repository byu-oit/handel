const winston = require('winston');
const _ = require('lodash');

exports.preDeployServices = function(serviceDeployers, environmentContext) {
    winston.info(`Executing pre-deploy on services in environment ${environmentContext.environmentName}`);

    let preDeployPromises = [];

     _.forEach(environmentContext.serviceContexts, function(serviceContext) {
        let serviceDeployer = serviceDeployers[serviceContext.serviceType];
        preDeployPromises.push(serviceDeployer.preDeploy(serviceContext));
    });

    return Promise.all(preDeployPromises)
        .then(promiseResults => {
            var preDeployResults = {}
            let i = 0;
            _.forEach(environmentContext.serviceContexts, function(serviceContext) {
                preDeployResults[serviceContext.serviceName] = promiseResults[i];
                i++;
            });
            return preDeployResults;
        })
}
