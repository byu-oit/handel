const util = require('../util/util');
const winston = require('winston');
const _ = require('lodash');

exports.parseDeploySpec = function (deploySpec) {
    let deploySpecValid = true;
    if (!deploySpec.version) {
        winston.error(`Invalid deploy spec: The 'version' field is required`);
        deploySpecValid = false;
    }

    if (!deploySpec.name) {
        winston.error(`Invalid deploy spec: The 'name' field is required`);
        deploySpecValid = false;
    }

    if(!deploySpec.environments) {
        winston.error(`Invalid deploy spec: The 'environments' field is required`);
        deploySpecValid = false;
    }

    if(deploySpec.environments.length === 0) {
        winston.error(`Invalid deploy spec: The 'environments' field must contain 1 or more environment definitions`);
        deploySpecValid = false;
    }

    if(deploySpecValid) {
        return deploySpec;
    }
    else {
        return null;
    }
};

exports.getEnvironmentContext = function(deploySpec, environmentName) {
    environmentSpec = deploySpec.environments[environmentName];
    if(!environmentSpec) { return null; } //Return nothing if we can't find the requested environment

    var environmentContext = {
        environmentName: environmentName,
        serviceContexts: []
    }

    _.forEach(environmentSpec, function(systemSpec, systemName) {
        var systemContext = {
            name: systemName
        }
        ///TODO - Work Here Left Off
        environmentContext.serviceContexts.push();
        console.log(systemContext);
        console.log(systemName);
    })
    
    return environmentContext;

    // let serviceDeployerPath = `../services/${environmentContext.name}`
    // let serviceDeployer = require('./')

    // return {
    //     serviceContext
    //     environmentContext: environmentContext,
    //     serviceDeployer: ''
    // }
}