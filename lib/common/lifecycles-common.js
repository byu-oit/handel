const winston = require('winston');
const PreDeployContext = require('../datatypes/pre-deploy-context');

exports.preDeployNotRequired = function (serviceContext) {
    winston.debug(`${serviceContext.serviceType} - PreDeploy is not required for this service, skipping it`);
    return Promise.resolve(new PreDeployContext(serviceContext));
}