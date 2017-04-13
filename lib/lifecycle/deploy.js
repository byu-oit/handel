const _ = require('lodash');
const winston = require('winston');
const DeployContext = require('../datatypes/deploy-context');
const request = require('request');
const yaml = require('js-yaml');

function makeHttpRequest(url) {
    return new Promise((resolve, reject) => {
        request(url, function (err, response, body) {
            if(!err) {
                if(response.statusCode === 200) {
                    return resolve(body);
                }
                else {
                    return reject(new Error(`Unhandled status code: ${response.statusCode}`));
                }
            }
            else {
                return reject(err);
            }
        });
    });
}


function getGitHubHandelFile(serviceDependencyName) {
    //GitHub://byu-oit-appdev/my-other-repo/my-queue/dev/queue
    let parts = serviceDependencyName.replace("GitHub://", "").split("/");
    if(parts.length !== 5) {
        throw new Error("Invalid external GitHub service reference. Must be of the following format: GitHub://<orgName>/<repoName>/<appName>/<environmentName>/<serviceName>");
    }
    let orgName = parts[0];
    let repoName = parts[1];
    let appName = parts[2];
    let envName = parts[3];
    let serviceName = parts[4];

    return makeHttpRequest(`https://raw.githubusercontent.com/${orgName}/${repoName}/master/handel.yml`)
        .then(data => {
            return yaml.safeLoad(data);
        });
}


function getExternalDependencyDeployContext(serviceDependencyName) {
    return getGitHubHandelFile(serviceDependencyName)
        .then(handelFile => {
            console.log(handelFile);
            process.exit(0); //TODO - REMOVE LATER
        });

    //Get Handel file remotely
                //Read the service context from the definition
                //If not allowed to be consumed by this service:
                    //Throw error
                //Else
                    //Get DeployContext from service deployer, giving service context as parameter (may throw error)

}

function getInternalDependencyDeployContext(serviceDependencyName, environmentContext, deployContexts) {
    if(!environmentContext.serviceContexts[serviceDependencyName]) {
        throw new Error(`Invalid service dependency: ${serviceDependencyName}`);
    }
    return deployContexts[serviceDependencyName]
}


function getDependencyDeployContexts(serviceToDeploy, environmentContext, deployContexts) {
    let getDeployContextPromises = [];
    let dependenciesDeployContexts = [];

    let serviceToDeployDependencies = serviceToDeploy.params.dependencies
    if(serviceToDeployDependencies && serviceToDeployDependencies.length > 0) {
        _.forEach(serviceToDeployDependencies, function(serviceDependencyName) {
            if(serviceDependencyName.startsWith("GitHub://")) { //GitHub External dependency
                let dependency = getExternalDependencyDeployContext(serviceDependencyName);
                //TODO - NEEDS WORK HERE
            }
            else { //Internal dependency
                let dependency = getInternalDependencyDeployContext(serviceDependencyName, environmentContext, deployContexts);
                dependenciesDeployContexts.push(dependency);
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
                levelDeployContexts[toDeployServiceName] = deployContext;
            });
        serviceDeployPromises.push(serviceDeployPromise);
    }

    return Promise.all(serviceDeployPromises)
        .then(() => {
            return levelDeployContexts; //This was built up at each deploy above
        });
}