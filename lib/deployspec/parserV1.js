const _ = require('lodash');

exports.parseDeploySpec = function (deploySpec) {
    if (!deploySpec.version) {
        throw new Error(`Invalid deploy spec: The 'version' field is required`)
    }

    if (!deploySpec.name) {
        throw new Error(`Invalid deploy spec: The 'name' field is required`)
    }
    if(deploySpec.name.length > 15) {
        throw new Error(`Invalid deploy spec: The 'name' field may not be greater than 10 characters`)
    }

    if(!deploySpec.environments) {
        throw new Error(`Invalid deploy spec: The 'environments' field is required`)
    }

    if(deploySpec.environments.length === 0) {
        throw new Error(`Invalid deploy spec: The 'environments' field must contain 1 or more environment definitions`)
    }

    //TODO - Check name limits on environment and service names

    return deploySpec;
};

exports.getEnvironmentContext = function(deploySpec, environmentName) {
    let environmentSpec = deploySpec.environments[environmentName];
    if(!environmentSpec) {
        throw new Error(`Can't find the requested environment in the deploy spec: ${environmentName}`)
    }

    var environmentContext = {
        environmentName: environmentName,
        serviceContexts: {}
    }

    _.forEach(environmentSpec, function(serviceSpec, serviceName) {
        //TODO - Ensure system names can't be the same
        var serviceType = serviceSpec.type;

        //Verify service type
        if(!serviceType) {
            throw new Error(`This service doesn't have a service type specified: ${serviceName}`)
        }
        try { 
            let deployerPath = `../services/${serviceType}`
            require(deployerPath); //Ok to do sync call inline here since this is initial setup and won't block anyone else
        }
        catch(e) {
            throw new Error(`Invalid or unsupported service name specified: ${serviceName}`);
        }

        var serviceContext = {
            appName: deploySpec.name,
            environmentName: environmentName,
            serviceName: serviceName,
            serviceType: serviceType,
            params: serviceSpec
        }

        environmentContext.serviceContexts[serviceName] = serviceContext;
    });

    return environmentContext;
}

