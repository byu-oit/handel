const winston = require('winston');
const PreDeployContext = require('../datatypes/pre-deploy-context');
const BindContext = require('../datatypes/bind-context');
const DeployContext = require('../datatypes/deploy-context');

exports.preDeployNotRequired = function (serviceContext) {
    winston.debug(`${serviceContext.serviceType} - PreDeploy is not required for this service, skipping it`);
    return Promise.resolve(new PreDeployContext(serviceContext));
}

exports.bindNotRequired = function (ownServiceContext, dependentOfServiceContext) {
    winston.debug(`${ownServiceContext.serviceType} - Bind is not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
}

exports.deployNotRequired = function (ownServiceContext) {
    winston.debug(`${ownServiceContext.serviceType} - Deploy is not required for this service, skipping it`);
    return Promise.resolve(new DeployContext(ownServiceContext));
}