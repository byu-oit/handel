const _ = require('lodash');
const winston = require('winston');
const DeployContext = require('../datatypes/deploy-context');
const ServiceContext = require('../datatypes/service-context');
const request = require('request');
const yaml = require('js-yaml');
const util = require('../util/util');

function getExternalServiceContext(serviceDependencyName) {
    let parts = serviceDependencyName.split("#");
    let errorMsg = "Invalid external GitHub service reference. Must be of the following format: https://pathtohandelfile.domain#appName=<appName>&environmentName=<environmentName>&serviceName=<serviceName>"
    if(parts.length !== 2) {
        throw new Error(errorMsg);
    }
    let handelFileUrl = parts[0];
    let externalServiceInfo = util.parseHashValue(parts[1]);
    let appName = externalServiceInfo.appName;
    let envName = externalServiceInfo.environmentName;
    let serviceName = externalServiceInfo.serviceName;
    if(!appName || !envName || !serviceName) {
        throw new Error(errorMsg);
    }

    return util.makeHttpRequest(handelFileUrl)
        .then(data => {
            let handelFile = yaml.safeLoad(data);
            let serviceDef = handelFile.environments[envName][serviceName];
            let serviceType = serviceDef.type;
            let serviceContext = new ServiceContext(appName, envName, serviceName, serviceType, deployVersion, serviceDef);
            console.log(serviceContext);
            process.exit(0); //TODO - REMOVE LATER
            //Get ServiceContext from handelFileInfoParts
        });
}


function getExternalDependencyDeployContext(serviceDependencyName) {
    return getExternalServiceContext(serviceDependencyName)
        .then(serviceContext => {
            //Get DeployContext from service deployer, passing service context as parameter
        });
}

function getInternalDependencyDeployContext(serviceDependencyName, environmentContext, deployContexts) {
    return new Promise((resolve, reject) => {
        if(!environmentContext.serviceContexts[serviceDependencyName]) {
            return reject(new Error(`Invalid service dependency: ${serviceDependencyName}`));
        }
        return resolve(deployContexts[serviceDependencyName]);
    });
}


function getDependencyDeployContexts(serviceToDeploy, environmentContext, deployContexts) {
    let getDeployContextPromises = [];
    let dependenciesDeployContexts = [];

    let serviceToDeployDependencies = serviceToDeploy.params.dependencies
    if(serviceToDeployDependencies && serviceToDeployDependencies.length > 0) {
        _.forEach(serviceToDeployDependencies, function(serviceDependencyName) {
            if(serviceDependencyName.startsWith("https://")) { //GitHub External dependency
                let getDeployContextPromise = getExternalDependencyDeployContext(serviceDependencyName)
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
        let serviceDeployPromise = getDependencyDeployContexts(toDeployServiceContext, environmentContext, deployContexts)
            .then(dependenciesDeployContexts => {
                //Deploy the service
                winston.info(`Deploying service ${toDeployServiceName}`);
                return serviceDeployer.deploy(toDeployServiceContext, toDeployPreDeployContext, dependenciesDeployContexts)
                    .then(deployContext => {
                        if(!(deployContext instanceof DeployContext)) {
                            throw new Error("Expected DeployContext as result from 'deploy' phase");
                        }
                        levelDeployContexts[toDeployServiceName] = deployContext;
                    });
            });
            
        serviceDeployPromises.push(serviceDeployPromise);
    }

    return Promise.all(serviceDeployPromises)
        .then(() => {
            return levelDeployContexts; //This was built up at each deploy above
        });
}