const _ = require('lodash');
const winston = require('winston');
const DeployContext = require('../datatypes/deploy-context');
const ServiceContext = require('../datatypes/service-context');
const request = require('request');
const yaml = require('js-yaml');
const util = require('../util/util');


function getInternalDependencyDeployContext(serviceDependencyName, environmentContext, deployContexts) {
    return new Promise((resolve, reject) => {
        if(!environmentContext.serviceContexts[serviceDependencyName]) {
            return reject(new Error(`Invalid service dependency: ${serviceDependencyName}`));
        }
        return resolve(deployContexts[serviceDependencyName]);
    });
}

function getExternalDependencyDeployContext(toDeployServiceContext, toDeployPreDeployContext, externalServiceName, serviceDeployers) {
    //Get external service context
    return util.getExternalServiceContext(externalServiceName, "1") //We don't actually care about the version of an external service
        .then(externalServiceContext => {
            let externalServiceType = externalServiceContext.serviceType;
            let externalServiceDeployer = serviceDeployers[externalServiceType];
            return externalServiceDeployer.getPreDeployContextForExternalRef(externalServiceContext)
                .then(externalPreDeployContext => {
                    return externalServiceDeployer.getBindContextForExternalRef(externalServiceContext, externalPreDeployContext, toDeployServiceContext, toDeployPreDeployContext);
                })
                .then(externalBindContext => { //We don't use BindContext, just need to make sure it ran
                    return externalServiceDeployer.getDeployContextForExternalRef(externalServiceContext);
                });
        });
}


function getDependencyDeployContexts(toDeployServiceContext, toDeployPreDeployContext, environmentContext, deployContexts, serviceDeployers) {
    let getDeployContextPromises = [];
    let dependenciesDeployContexts = [];

    let serviceToDeployDependencies = toDeployServiceContext.params.dependencies
    if(serviceToDeployDependencies && serviceToDeployDependencies.length > 0) {
        _.forEach(serviceToDeployDependencies, function(serviceDependencyName) {
            if(serviceDependencyName.startsWith("https://")) { //External dependency
                let getDeployContextPromise = getExternalDependencyDeployContext(toDeployServiceContext, toDeployPreDeployContext, serviceDependencyName, serviceDeployers)
                    .then(deployContext => {
                        dependenciesDeployContexts.push(deployContext);
                    });
                getDeployContextPromises.push(getDeployContextPromise);
            }
            else { //Internal dependency
                let getDeployContextPromise = getInternalDependencyDeployContext(serviceDependencyName, environmentContext, deployContexts)
                    .then(deployContext => {
                        dependenciesDeployContexts.push(deployContext);
                    });
                getDeployContextPromises.push(getDeployContextPromise);
            }
        });
    }

    return Promise.all(getDeployContextPromises)
        .then(() => {
            return dependenciesDeployContexts; //This was built up at each deploy above
        });
}

exports.deployServicesInLevel = function(serviceDeployers, environmentContext, preDeployContexts, deployContexts, deployOrder, level) {
    let serviceDeployPromises = [];
    let levelDeployContexts = {};

    var currentLevelElements = deployOrder[level];
    winston.info(`Deploying level ${level} of services: ${currentLevelElements.join(', ')}`);
    for(let i = 0; i < currentLevelElements.length; i++) {
        //Get ServiceContext and PreDeployContext for service being deployed
        let toDeployServiceName = currentLevelElements[i]
        let toDeployServiceContext = environmentContext.serviceContexts[toDeployServiceName];
        let toDeployPreDeployContext = preDeployContexts[toDeployServiceName];
        
        let serviceDeployer = serviceDeployers[toDeployServiceContext.serviceType];        

        //Get all the DeployContexts for services that this service being deployed depends on
        let serviceDeployPromise = getDependencyDeployContexts(toDeployServiceContext, toDeployPreDeployContext, environmentContext, deployContexts, serviceDeployers)
            .then(dependenciesDeployContexts => {
                //Deploy the service
                winston.info(`Deploying service ${toDeployServiceName}`);
                return serviceDeployer.deploy(toDeployServiceContext, toDeployPreDeployContext, dependenciesDeployContexts);
            })
            .then(deployContext => {
                if(!(deployContext instanceof DeployContext)) {
                    throw new Error("Expected DeployContext as result from 'deploy' phase");
                }
                levelDeployContexts[toDeployServiceName] = deployContext;
            });
            
        serviceDeployPromises.push(serviceDeployPromise);
    }

    return Promise.all(serviceDeployPromises)
        .then(() => {
            return levelDeployContexts; //This was built up at each deploy above
        });
}