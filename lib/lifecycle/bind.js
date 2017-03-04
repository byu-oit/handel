const winston = require('winston');

exports.bindServicesInLevel = function(serviceDeployers, environmentContext, deployOrder, level) {
    let bindDeployPromises = [];

    var currentLevelElements = deployOrder[level];
    winston.info(`Binding level ${level} of services: ${currentLevelElements.join(', ')}`);
    for(let i = 0; i < currentLevelElements.length; i++) {
        let toBindServiceContext = environmentContext.serviceContexts[currentLevelElements[i]];
        let serviceDeployer = serviceDeployers[toBindServiceContext.serviceType];
        bindDeployPromises.push(serviceDeployer.bind(toBindServiceContext));
    }

    return Promise.all(bindDeployPromises);
    //TODO - Return the BindContexts
}