const _ = require('lodash');
const ServiceContext = require('../datatypes/service-context');
const EnvironmentContext = require('../datatypes/environment-context');

function checkFieldRequired(handelFile, fieldName) {
    if (!handelFile[fieldName]) {
        throw new Error(`Invalid deploy spec: The '${fieldName}' field is required`)
    }
}

function checkFieldMatchesRegex(handelFile, fieldName) {
    let appEnvServiceNameRegex = /^[a-zA-Z0-9-]+$/;
    if(!fieldName.match(appEnvServiceNameRegex)) {
        throw new Error(`Invalid deploy spec: The '${fieldName}' field may contain only alphanumeric characters and dashes`);
    }
}

function checkFieldLengthRequirement(handelFile, fieldName, maxLength) {
    if(handelFile[fieldName].length > maxLength) {
        throw new Error(`Invalid deploy spec: The '${fieldName}' field may not be greater than ${maxLength} characters`);
    }
}

/**
 * Ensure that the top-level of the deploy spec is valid.
 * 
 * This does not check the individual services in the spec, those are handled by the 
 * service deployer themselves.
 */
exports.validateHandelFile = function (handelFile) {
    checkFieldRequired(handelFile, 'version');

    //Name field requirements
    checkFieldRequired(handelFile, 'name');
    checkFieldMatchesRegex(handelFile, 'name');
    checkFieldLengthRequirement(handelFile, 'name', 30);
    
    //Environments field requirements
    checkFieldRequired(handelFile, 'environments');
    if(handelFile.environments.length === 0) {
        throw new Error(`Invalid deploy spec: The 'environments' field must contain 1 or more environment definitions`)
    }
    for(let envName in handelFile.environments) {
        checkFieldMatchesRegex(handelFile.environments, envName);
        checkFieldLengthRequirement(handelFile.environments, envName, 10);

        for(let serviceName in handelFile.environments[envName]) {
            checkFieldMatchesRegex(handelFile.environments[envName], serviceName);
            checkFieldLengthRequirement(handelFile.environments[envName], serviceName, 20);
        }
    }
};

/**
 * Given a deploy spec, returns the EnvironmentContext for the requested environment
 * 
 * @param {Object} handelFile - The Object representing the provided YAML deploy spec file
 * @param {String} environmentName - The name of the environment in the deploy spec for which we want the EnvironmentContext
 * @param {String} deployVersion - The version of the app being deployed
 */
exports.getEnvironmentContext = function(handelFile, environmentName, deployVersion) {
    let environmentSpec = handelFile.environments[environmentName];
    if(!environmentSpec) {
        throw new Error(`Can't find the requested environment in the deploy spec: ${environmentName}`)
    }

    let environmentContext = new EnvironmentContext(handelFile.name, deployVersion, environmentName);

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
            throw new Error(`Invalid or unsupported service type specified: ${serviceType}`);
        }

        var serviceContext = new ServiceContext(handelFile.name, environmentName, serviceName,
                                                serviceType, deployVersion, serviceSpec);
        environmentContext.serviceContexts[serviceName] = serviceContext;
    });

    return environmentContext;
}

