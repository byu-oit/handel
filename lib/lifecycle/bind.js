const winston = require('winston');
const util = require('../util/util');
const BindContext = require('../datatypes/bind-context');
const _ = require('lodash');

function getDependentServicesForCurrentBindService(environmentContext, toBindServiceName) {
    let dependentServices = [];
    for(let currentServiceName in environmentContext.serviceContexts) {
        let currentService = environmentContext.serviceContexts[currentServiceName];
        let currentServiceDeps = currentService.params.dependencies;
        if(currentServiceDeps && currentServiceDeps.includes(toBindServiceName)) {
            dependentServices.push(currentServiceName);
        }
    }
    return dependentServices;
}

function bindInternalServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployOrder, levelToBind) {
    let bindInternalPromises = [];
    let levelBindContexts = {};

    let currentLevelServicesToBind = deployOrder[levelToBind];
    winston.info(`Binding internal service dependencies (if any) on level ${levelToBind} for services ${currentLevelServicesToBind.join(', ')}`);
    for(let i = 0; i < currentLevelServicesToBind.length; i++) {
        let toBindServiceName = currentLevelServicesToBind[i];

        //Get ServiceContext and PreDeployContext for the service to call bind on
        let toBindServiceContext = environmentContext.serviceContexts[toBindServiceName];
        let serviceDeployer = serviceDeployers[toBindServiceContext.serviceType];
        let toBindPreDeployContext = preDeployContexts[toBindServiceName];


        //This service may have multiple services dependening on it, run bind on each of them
        for(let dependentOfServiceName of getDependentServicesForCurrentBindService(environmentContext, toBindServiceName)) {
            //Get ServiceContext and PreDeployContext for the service dependency
            let dependentOfServiceContext = environmentContext.serviceContexts[dependentOfServiceName];
            let dependentOfPreDeployContext = preDeployContexts[dependentOfServiceName];

            //Run bind on the service combination
            let bindContextName = util.getBindContextName(toBindServiceName, dependentOfServiceName)
            winston.info(`Binding internal service ${bindContextName}`);
            let bindPromise = serviceDeployer.bind(toBindServiceContext, toBindPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext)
                .then(bindContext => {
                    if(!(bindContext instanceof BindContext)) {
                        throw new Error("Expected BindContext back from 'bind' phase of service deployer");
                    }
                    levelBindContexts[bindContextName] = bindContext;
                });
            bindInternalPromises.push(bindPromise);
        }
    }

    return Promise.all(bindInternalPromises)
        .then(() => {
            return levelBindContexts; //This was built up at each bind above
        });
}

function bindExternalServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployOrder, levelToBind) {
    let bindExternalPromises = [];
    let externalBindContexts = {};

    let currentLevelServicesToBind = deployOrder[levelToBind];
    winston.info(`Binding external service dependencies (if any) on level ${levelToBind} for services ${currentLevelServicesToBind.join(', ')}`);
    for(let i = 0; i < currentLevelServicesToBind.length; i++) {
        let toBindServiceName = currentLevelServicesToBind[i];

        //Get ServiceContext and PreDeployContext for the service to call bind on
        let toBindServiceContext = environmentContext.serviceContexts[toBindServiceName];
        let toBindPreDeployContext = preDeployContexts[toBindServiceName];
        let serviceDeployer = serviceDeployers[toBindServiceContext.serviceType];

        //Only bind on external services if the "external_dependent_services" parameter is specified
        if(toBindServiceContext.params.external_dependent_services) {
            for(let externalDependentServiceName of toBindServiceContext.params.external_dependent_services) {
                let bindContextName = util.getBindContextName(toBindServiceName, externalDependentServiceName)
                winston.info(`Binding external service ${bindContextName}`);
                let bindPromise = util.getExternalServiceContext(externalDependentServiceName, "1")
                    .then(externalServiceContext => {
                        return serviceDeployer.getPreDeployContextForExternalRef(externalServiceContext)
                            .then(externalPreDeployContext => {
                                return serviceDeployer.bind(toBindServiceContext, toBindPreDeployContext, externalServiceContext, externalPreDeployContext);
                            });
                    })
                    .then(bindContext => {
                        if(!(bindContext instanceof BindContext)) {
                            throw new Error("Expected BindContext back from 'bind' phase of service deployer");
                        }
                        externalBindContexts[bindContextName] = bindContext;
                    });
                bindExternalPromises.push(bindPromise);
            }
        }
    }

    return Promise.all(bindExternalPromises)
        .then(() => {
            return externalBindContexts;
        });
}

exports.bindServicesInLevel = function(serviceDeployers, 
                                       environmentContext, 
                                       preDeployContexts, 
                                       deployOrder, 
                                       levelToBind) {
    winston.info(`Executing bind on level ${levelToBind} of services`);
    return bindInternalServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployOrder, levelToBind)
        .then(levelInternalBindContexts => {
            return bindExternalServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployOrder, levelToBind)
                .then(levelExternalBindContexts => {
                    return _.assign(levelInternalBindContexts, levelExternalBindContexts);
                });
        });
}