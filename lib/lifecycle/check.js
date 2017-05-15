const winston = require('winston');
const _ = require('lodash');

exports.checkServices = function(serviceDeployers, environmentContext) {
    winston.info(`Checking services in environment ${environmentContext.environmentName}`);
    //Run check on all services in environment to make sure params are valid
    let errors = [];
    _.forEach(environmentContext.serviceContexts, function(serviceContext) {
        let serviceDeployer = serviceDeployers[serviceContext.serviceType];
        let checkErrors = serviceDeployer.check(serviceContext);
        errors = errors.concat(checkErrors);
    });
    return errors;
}