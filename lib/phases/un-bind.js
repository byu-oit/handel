const winston = require('winston');
const UnBindContext = require('../datatypes/un-bind-context');

exports.unBindServicesInLevel = function (serviceDeployers, environmentContext, deployOrder, level) {
    let unBindPromises = [];
    let unBindContexts = {};

    let currentLevelServicesToUnBind = deployOrder[level];
    winston.info(`Running UnBind on service dependencies (if any) in level ${level} for services ${currentLevelServicesToUnBind.join(', ')}`);
    for (let i = 0; i < currentLevelServicesToUnBind.length; i++) {
        let toUnBindServiceName = currentLevelServicesToUnBind[i];
        let toUnBindServiceContext = environmentContext.serviceContexts[toUnBindServiceName];
        let serviceDeployer = serviceDeployers[toUnBindServiceContext.serviceType];

        winston.info(`UnBinding service ${toUnBindServiceName}`);
        
        let unBindPromise = serviceDeployer.unBind(toUnBindServiceContext)
            .then(unBindContext => {
                if(!(unBindContext instanceof UnBindContext)) {
                    throw new Error("Expected UnBindContext back from 'unBind' phase of service deployer");
                }
                unBindContexts[toUnBindServiceName] = unBindContext;
            });
        unBindPromises.push(unBindPromise);
    }

    return Promise.all(unBindPromises)
        .then(() => {
            return unBindContexts; //This was built up dynamically above
        });
}