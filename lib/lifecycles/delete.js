/*
 * Copyright 2017 Brigham Young University
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
const winston = require('winston');
const util = require('../common/util');
const deployOrderCalc = require('../deploy/deploy-order-calc');
const unDeployPhase = require('../phases/un-deploy');
const unPreDeployPhase = require('../phases/un-pre-deploy');
const unBindPhase = require('../phases/un-bind');
const EnvironmentDeleteResult = require('../datatypes/environment-delete-result');

function unDeployAndUnBindServices(serviceDeployers, environmentContext, deployOrder) {
    let deleteProcess = Promise.resolve();
    let unBindContexts = {};
    let unDeployContexts = {};
    for (let currentLevel = deployOrder.length - 1; deployOrder[currentLevel]; currentLevel--) {
        deleteProcess = deleteProcess
            .then(() => unDeployPhase.unDeployServicesInLevel(serviceDeployers, environmentContext, deployOrder, currentLevel))
            .then(levelUnDeployResults => {
                for (let serviceName in levelUnDeployResults) {
                    unDeployContexts[serviceName] = levelUnDeployResults[serviceName];
                }
            })
            .then(() => unBindPhase.unBindServicesInLevel(serviceDeployers, environmentContext, deployOrder, currentLevel))
            .then(levelUnBindResults => {
                for (let serviceName in levelUnBindResults) {
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
    if (!accountConfig || !environmentContext) {
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

exports.delete = function (accountConfig, handelFile, environmentToDelete, handelFileParser, serviceDeployers) {
    return Promise.resolve().then(() => {
        //Run the delete on the environment specified
        let environmentContext = util.createEnvironmentContext(handelFile, handelFileParser, environmentToDelete, accountConfig);
        return deleteEnvironment(accountConfig, serviceDeployers, environmentContext);
    });
};
