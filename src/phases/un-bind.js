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
const UnBindContext = require('../datatypes').UnBindContext;
const lifecyclesCommon = require('../common/lifecycles-common');

exports.unBindServicesInLevel = function (serviceDeployers, environmentContext, deployOrder, level) {
    let unBindPromises = [];
    let unBindContexts = {};

    let currentLevelServicesToUnBind = deployOrder[level];
    winston.info(`Running UnBind on service dependencies (if any) in level ${level} for services ${currentLevelServicesToUnBind.join(', ')}`);
    for (let i = 0; i < currentLevelServicesToUnBind.length; i++) {
        let toUnBindServiceName = currentLevelServicesToUnBind[i];
        let toUnBindServiceContext = environmentContext.serviceContexts[toUnBindServiceName];
        let serviceDeployer = serviceDeployers[toUnBindServiceContext.serviceType];

        winston.debug(`UnBinding service ${toUnBindServiceName}`);
        if (serviceDeployer.unBind) {
            let unBindPromise = serviceDeployer.unBind(toUnBindServiceContext)
                .then(unBindContext => {
                    if (!(unBindContext instanceof UnBindContext)) {
                        throw new Error("Expected UnBindContext back from 'unBind' phase of service deployer");
                    }
                    unBindContexts[toUnBindServiceName] = unBindContext;
                });
            unBindPromises.push(unBindPromise);
        }
        else { //If unbind not implemented by deployer, return an empty unbind context
            let unBindPromise = lifecyclesCommon.unBindNotRequired(toUnBindServiceContext)
                .then(unBindContext => {
                    unBindContexts[toUnBindServiceName] = unBindContext;
                });
            unBindPromises.push(unBindPromise);
        }
    }

    return Promise.all(unBindPromises)
        .then(() => {
            return unBindContexts; //This was built up dynamically above
        });
}