const winston = require('winston');
const UnDeployContext = require('../datatypes/un-deploy-context.js');

exports.unDeployServicesInLevel = function(serviceDeployers, environmentContext, deployOrder, level) {
    let serviceUnDeployPromises = [];
    let levelUnDeployContexts = {};

    let currentLevelElements = deployOrder[level];
    winston.info(`UnDeploying level ${level} of services: ${currentLevelElements.join(', ')}`);
    for(let i = 0; i < currentLevelElements.length; i++) {
        let toUnDeployServiceName = currentLevelElements[i];
        let toUnDeployServiceContext = environmentContext.serviceContexts[toUnDeployServiceName];

        let serviceDeployer = serviceDeployers[toUnDeployServiceContext.serviceType];

        winston.info(`UnDeploying service ${toUnDeployServiceName}`);
        let serviceUndeployPromise = serviceDeployer.unDeploy(toUnDeployServiceContext)
            .then(unDeployContext => {
                if(!(unDeployContext instanceof UnDeployContext)) {
                    throw new Error("Expected UnDeployContext as result from 'unDeploy' phase");
                }
                levelUnDeployContexts[toUnDeployServiceName] = unDeployContext;
            });
        
        serviceUnDeployPromises.push(serviceUndeployPromise);
    }

    return Promise.all(serviceUnDeployPromises)
        .then(() => {
            return levelUnDeployContexts; //This was build up dynamically above
        });
}
