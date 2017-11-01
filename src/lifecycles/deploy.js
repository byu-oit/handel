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
const EnvironmentDeployResult = require('../datatypes/environment-deploy-result');
const checkPhase = require('../phases/check');
const bindPhase = require('../phases/bind');
const deployPhase = require('../phases/deploy');
const preDeployPhase = require('../phases/pre-deploy');
const consumeEventsPhase = require('../phases/consume-events');
const produceEventsPhase = require('../phases/produce-events');
const deployOrderCalc = require('../deploy/deploy-order-calc');

function setupEventBindings(serviceDeployers, environmentContext, deployContexts) {
    return consumeEventsPhase.consumeEvents(serviceDeployers, environmentContext, deployContexts)
        .then(consumeEventsContexts => {
            return produceEventsPhase.produceEvents(serviceDeployers, environmentContext, deployContexts)
                .then(produceEventsContexts => {
                    return {
                        consumeEventsContexts: consumeEventsContexts,
                        produceEventsContexts: produceEventsContexts
                    };
                });
        });
}

function bindAndDeployServices(serviceDeployers, environmentContext, preDeployContexts, deployOrder) {
    let deployProcess = Promise.resolve();
    let bindContexts = {}
    let deployContexts = {}
    for (let currentLevel = 0; deployOrder[currentLevel]; currentLevel++) {
        deployProcess = deployProcess
            .then(() => bindPhase.bindServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployOrder, currentLevel))
            .then(levelBindResults => {
                for (let serviceName in levelBindResults) {
                    bindContexts[serviceName] = levelBindResults[serviceName]
                }
            })
            .then(() => deployPhase.deployServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployContexts, deployOrder, currentLevel))
            .then(levelDeployResults => {
                for (let serviceName in levelDeployResults) {
                    deployContexts[serviceName] = levelDeployResults[serviceName]
                }
                return {
                    bindContexts,
                    deployContexts
                }
            });
    }

    return deployProcess;
}


/**
 * Performs the actual deploy
 * 
 * @returns Promise.<EnvironmentDeployResult>
 */
function deployEnvironment(accountConfig, serviceDeployers, environmentContext) {
    if (!accountConfig || !environmentContext) {
        return Promise.resolve(new EnvironmentDeployResult("failure", "Invalid configuration"));
    }
    else {
        winston.info(`Starting deploy for environment ${environmentContext.environmentName}`);

        let errors = checkPhase.checkServices(serviceDeployers, environmentContext);
        if (errors.length === 0) {
            //Run pre-deploy (all services get run in parallel, regardless of level)
            return preDeployPhase.preDeployServices(serviceDeployers, environmentContext)
                .then(preDeployResults => {
                    //Deploy services (this will be done ordered levels at a time)
                    let deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
                    return bindAndDeployServices(serviceDeployers, environmentContext, preDeployResults, deployOrder)
                })
                .then(bindAndDeployResults => {
                    return setupEventBindings(serviceDeployers, environmentContext, bindAndDeployResults.deployContexts);
                })
                .then(eventBindingResults => {
                    return new EnvironmentDeployResult("success");
                })
                .catch(err => {
                    return new EnvironmentDeployResult("failure", err.message, err);
                });
        }
        else {
            return Promise.resolve(new EnvironmentDeployResult("failure", `Errors while checking deploy spec: \n${errors.join("\n")}`));
        }
    }
}

exports.deploy = function (accountConfig, handelFile, environmentsToDeploy, handelFileParser, serviceDeployers) {
    return Promise.resolve().then(() => {
        //Check current credentials against the accountConfig
        let envDeployPromises = [];
        for (let environmentToDeploy of environmentsToDeploy) {
            let environmentContext = util.createEnvironmentContext(handelFile, handelFileParser, environmentToDeploy, accountConfig);
            envDeployPromises.push(deployEnvironment(accountConfig, serviceDeployers, environmentContext));
        }
        return Promise.all(envDeployPromises);
    });
}
