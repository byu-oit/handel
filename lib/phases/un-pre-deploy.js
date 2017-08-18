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
const UnPreDeployContext = require('../datatypes/un-pre-deploy-context');

exports.unPreDeployServices = function (serviceDeployers, environmentContext) {
    winston.info(`Executing UnPreDeploy on services in environment ${environmentContext.environmentName}`);
    let unPreDeployPromises = [];
    let unPreDeployContexts = {};

    for (let serviceName in environmentContext.serviceContexts) {
        let serviceContext = environmentContext.serviceContexts[serviceName];
        winston.debug(`Executing UnPreDeploy on service ${serviceName}`);
        let serviceDeployer = serviceDeployers[serviceContext.serviceType];
        let unPreDeployPromise = serviceDeployer.unPreDeploy(serviceContext)
            .then(unPreDeployContext => {
                if (!(unPreDeployContext instanceof UnPreDeployContext)) {
                    throw new Error("Expected PreDeployContext as result from 'preDeploy' phase");
                }
                unPreDeployContexts[serviceContext.serviceName] = unPreDeployContext;
            });
        unPreDeployPromises.push(unPreDeployPromise);
    }

    return Promise.all(unPreDeployPromises)
        .then(() => {
            return unPreDeployContexts; //This was built up dynamically above
        });
}