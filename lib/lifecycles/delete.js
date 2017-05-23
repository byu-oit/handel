const winston = require('winston');
const config = require('../util/account-config');
const util = require('../util/util');
const deployOrderCalc = require('../deploy/deploy-order-calc');
const unDeployPhase = require('../phases/un-deploy');
const unPreDeployPhase = require('../phases/un-pre-deploy');
const unBindPhase = require('../phases/un-bind');
const EnvironmentDeleteResult = require('../datatypes/environment-delete-result');

function unDeployAndUnBindServices(serviceDeployers, environmentContext, deployOrder) {
    let deleteProcess = Promise.resolve();
    let unBindContexts = {};
    let unDeployContexts = {};
    for(let currentLevel = deployOrder.length-1; deployOrder[currentLevel]; currentLevel--) {
        deleteProcess = deleteProcess
            .then(() => unDeployPhase.unDeployServicesInLevel(serviceDeployers, environmentContext, deployOrder, currentLevel))
            .then(levelUnDeployResults => {
                for(let serviceName in levelUnDeployResults) {
                    unDeployContexts[serviceName] = levelUnDeployResults[serviceName];
                }
            })
            .then(() => unBindPhase.unBindServicesInLevel(serviceDeployers, environmentContext, deployOrder, currentLevel))
            .then(levelUnBindResults => {
                for(let serviceName in levelUnBindResults) {
                    unBindContexts[serviceName] = levelUnBindResults[serviceName]
                }
                return {
                    unBindContexts,
                    unDeployContexts
                }
            });
    }
    
    return deleteProcess;
}


function deleteEnvironment(accountConfig, serviceDeployers, environmentContext) {
    if(!accountConfig || !environmentContext) {
        return Promise.resolve(new EnvironmentDeleteResult("failure", "Invalid configuration"));
    }
    else {
        winston.info(`Starting delete for environment ${environmentContext.environmentName}`);

        let deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
        return unDeployAndUnBindServices(serviceDeployers, environmentContext, deployOrder)
            .then(unDeployAndUnBindResults => {
                return unPreDeployPhase.unPreDeployServices(serviceDeployers, environmentContext)
            })
            .then(unPreDeployResults => {
                return new EnvironmentDeleteResult("success");
            })
            .catch(err => {
                return new EnvironmentDeleteResult("failure", err.message, err);
            });
    }
}

exports.delete = function(newAccountConfig, handelFile, environmentToDelete) {
    return new Promise((resolve, reject) => {
        try {
            //Pull account-level config from the provided file so it can be consumed by the library
            let accountConfig = config(newAccountConfig).getAccountConfig();

            //Set up AWS SDK with any global options
            util.configureAwsSdk(accountConfig);

            //Load all the currently implemented service deployers from the 'services' directory
            let serviceDeployers = util.getServiceDeployers();

            //Load Handel file from path and validate it
            winston.info("Validating and parsing Handel file");
            let handelFileParser = util.getHandelFileParser(handelFile);
            handelFileParser.validateHandelFile(handelFile, serviceDeployers);

            //Run the delete on the environment specified
            let environmentContext = util.createEnvironmentContext(handelFile, handelFileParser, environmentToDelete, "1"); //Use fake version since we're deleting it
            deleteEnvironment(accountConfig, serviceDeployers, environmentContext)
                .then(result => {
                    resolve(result);
                });
        }
        catch(err) {
            reject(err);
        }
    });
}