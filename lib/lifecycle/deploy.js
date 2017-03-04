const _ = require('lodash');
const winston = require('winston');

function getDependentServiceContexts(serviceToDeploy, environmentContext) {
    let dependentServiceContexts = [];

    if(serviceToDeploy.params.dependencies && serviceToDeploy.params.dependencies.length > 0) {
        _.forEach(serviceToDeploy.params.dependencies, function(serviceDependencyName) {
            if(!environmentContext.serviceContexts[serviceDependencyName]) {
                throw new Error(`Invalid service dependency: ${serviceDependencyName}`);
            }
            dependentServiceContexts.push(environmentContext.serviceContexts[serviceDependencyName]);
        });
    }

    return dependentServiceContexts;
}

exports.deployServicesInLevel = function(serviceDeployers, environmentContext, deployOrder, level) {
    let serviceDeployPromises = [];

    var currentLevelElements = deployOrder[level];
    winston.info(`Deploying level ${level} of services: ${currentLevelElements.join(', ')}`);
    for(let i = 0; i < currentLevelElements.length; i++) {
        let toDeployServiceContext = environmentContext.serviceContexts[currentLevelElements[i]];
        let dependentServiceContexts = getDependentServiceContexts(toDeployServiceContext, environmentContext);
        let serviceDeployer = serviceDeployers[toDeployServiceContext.serviceType];
        serviceDeployPromises.push(serviceDeployer.deploy(toDeployServiceContext, dependentServiceContexts));
    }

    return Promise.all(serviceDeployPromises);
    //TODO - Return the DeployContexts
}