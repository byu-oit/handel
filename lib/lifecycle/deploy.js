const _ = require('lodash');
const winston = require('winston');
const DeployContext = require('../datatypes/deploy-context');

function getDependencyDeployContexts(serviceToDeploy, environmentContext, deployContexts) {
    let dependenciesDeployContexts = [];

    let serviceToDeployDependencies = serviceToDeploy.params.dependencies
    if(serviceToDeployDependencies && serviceToDeployDependencies.length > 0) {
        _.forEach(serviceToDeployDependencies, function(serviceDependencyName) {
            if(!environmentContext.serviceContexts[serviceDependencyName]) {
                throw new Error(`Invalid service dependency: ${serviceDependencyName}`);
            }
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
        //Get ServiceContext and PreDeployContext for service being deployed
        let toDeployServiceName = currentLevelElements[i]
        let toDeployServiceContext = environmentContext.serviceContexts[toDeployServiceName];
        let toDeployPreDeployContext = preDeployContexts[toDeployServiceName];

        //Get all the DeployContexts for services that this service being deployed depends on
        let dependenciesDeployContexts = getDependencyDeployContexts(toDeployServiceContext, environmentContext, deployContexts);

        //Deploy the service
        let serviceDeployer = serviceDeployers[toDeployServiceContext.serviceType];
        winston.info(`Deploying service ${toDeployServiceName}`);
        let serviceDeployPromise = serviceDeployer.deploy(toDeployServiceContext, toDeployPreDeployContext, dependenciesDeployContexts)
            .then(deployContext => {
                if(!(deployContext instanceof DeployContext)) {
                    throw new Error("Expected DeployContext as result from 'deploy' phase");
                }
                levelDeployResults[toDeployServiceName] = deployContext;
            });
        serviceDeployPromises.push(serviceDeployPromise);
    }

    return Promise.all(serviceDeployPromises)
        .then(() => {
            return levelDeployResults; //This was built up at each deploy above
        });
}