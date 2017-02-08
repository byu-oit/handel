const util = require('../util/util');
const winston = require('winston');
const _ = require('lodash');

exports.parseDeploySpec = function (deploySpec) {
    if (!deploySpec.version) {
        throw new Error(`Invalid deploy spec: The 'version' field is required`)
    }

    if (!deploySpec.name) {
        throw new Error(`Invalid deploy spec: The 'name' field is required`)
    }

    if(!deploySpec.environments) {
        throw new Error(`Invalid deploy spec: The 'environments' field is required`)
    }

    if(deploySpec.environments.length === 0) {
        throw new Error(`Invalid deploy spec: The 'environments' field must contain 1 or more environment definitions`)
    }

    return deploySpec;
};

exports.getEnvironmentContext = function(deploySpec, environmentName) {
    environmentSpec = deploySpec.environments[environmentName];
    if(!environmentSpec) {
        throw new Error(`Can't find the requested environment in the deploy spec: ${environmentName}`)
    }

    var environmentContext = {
        environmentName: environmentName,
        serviceContexts: {}
    }

    _.forEach(environmentSpec, function(serviceSpec, serviceName) {
        var serviceType = serviceSpec.type;
        if(!serviceType) {
            throw new Error(`This service doesn't have a service type specified: ${serviceName}`)
        }

        var serviceContext = {
            name: serviceName,
            environmentName: environmentName,
            appName: deploySpec.name,
            type: serviceType,
            params: serviceSpec
        }

        //Get deployer for the service
        deployerPath = `../services/${serviceType}`
        try { 
            deployer = require(deployerPath); //Ok to do sync call inline here since this is initial setup and won't block anyone else
        }
        catch(e) {
            throw new Error(`Invalid or unsupported service name specified: ${serviceName}`);
        }

        serviceContext.deployer = deployer;

        environmentContext.serviceContexts[serviceName] = (serviceContext);
    });

    return environmentContext;
}