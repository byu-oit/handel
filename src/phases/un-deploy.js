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
const UnDeployContext = require('../datatypes').UnDeployContext;
const lifecyclesCommon = require('../common/lifecycles-common');

exports.unDeployServicesInLevel = function (serviceDeployers, environmentContext, deployOrder, level) {
    let serviceUnDeployPromises = [];
    let levelUnDeployContexts = {};

    let currentLevelElements = deployOrder[level];
    winston.info(`UnDeploying level ${level} of services: ${currentLevelElements.join(', ')}`);
    for (let i = 0; i < currentLevelElements.length; i++) {
        let toUnDeployServiceName = currentLevelElements[i];
        let toUnDeployServiceContext = environmentContext.serviceContexts[toUnDeployServiceName];

        let serviceDeployer = serviceDeployers[toUnDeployServiceContext.serviceType];

        winston.debug(`UnDeploying service ${toUnDeployServiceName}`);
        if (serviceDeployer.unDeploy) {
            let serviceUndeployPromise = serviceDeployer.unDeploy(toUnDeployServiceContext)
                .then(unDeployContext => {
                    if (!(unDeployContext instanceof UnDeployContext)) {
                        throw new Error("Expected UnDeployContext as result from 'unDeploy' phase");
                    }
                    levelUnDeployContexts[toUnDeployServiceName] = unDeployContext;
                });
            serviceUnDeployPromises.push(serviceUndeployPromise);
        }
        else {
            let serviceUndeployPromise = lifecyclesCommon.unDeployNotRequired(toUnDeployServiceContext)
                .then(unDeployContext => {
                    levelUnDeployContexts[toUnDeployServiceName] = unDeployContext;
                });
            serviceUnDeployPromises.push(serviceUndeployPromise);
        }
    }

    return Promise.all(serviceUnDeployPromises)
        .then(() => {
            return levelUnDeployContexts; //This was build up dynamically above
        });
}
