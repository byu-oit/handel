const _ = require('lodash');
const winston = require('winston');

function getDependencyDeployContexts(serviceToDeploy, environmentContext, deployContexts) {
    let dependenciesDeployContexts = [];

    let serviceToDeployDependencies = serviceToDeploy.params.dependencies
    if(serviceToDeployDependencies && serviceToDeployDependencies.length > 0) {
        _.forEach(serviceToDeployDependencies, function(serviceDependencyName) {
            if(!environmentContext.serviceContexts[serviceDependencyName]) {
                throw new Error(`Invalid service dependency: ${serviceDependencyName}`);
            }
            console.log(deployContexts[serviceDependencyName]);
            dependenciesDeployContexts.push(deployContexts[serviceDependencyName]);
        });
    }

    return dependenciesDeployContexts;
}

exports.deployServicesInLevel = function(serviceDeployers, environmentContext, preDeployContexts, deployContexts, deployOrder, level) {
    let serviceDeployPromises = [];
    let levelDeployResults = {};

    var currentLevelElements = deployOrder[level];
    winston.info(`Deploying level ${level} of services: ${currentLevelElements.join(', ')}`);
    for(let i = 0; i < currentLevelElements.length; i++) {
        let toDeployServiceName = currentLevelElements[i]
        let toDeployServiceContext = environmentContext.serviceContexts[toDeployServiceName];
        let toDeployPreDeployContext = preDeployContexts[toDeployServiceName];
        let dependenciesDeployContexts = getDependencyDeployContexts(toDeployServiceContext, environmentContext, deployContexts);
        let serviceDeployer = serviceDeployers[toDeployServiceContext.serviceType];

        winston.info(`Deploying service ${toDeployServiceName}`);
        serviceDeployPromises.push(serviceDeployer.deploy(toDeployServiceContext, 
                                                          toDeployPreDeployContext, 
                                                          dependenciesDeployContexts)
                                        .then(deployResult => {
                                            levelDeployResults[toDeployServiceName] = deployResult;
                                        }));
    }

    return Promise.all(serviceDeployPromises)
        .then(() => {
            return levelDeployResults; //This was built up at each deploy above
        });
    //TODO - Return the DeployContexts
}