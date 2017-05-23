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
const _ = require('lodash');
const PreDeployContext = require('../datatypes/pre-deploy-context');

exports.preDeployServices = function(serviceDeployers, environmentContext) {
    winston.info(`Executing pre-deploy on services in environment ${environmentContext.environmentName}`);
    let preDeployPromises = [];
    let preDeployContexts = {};

     _.forEach(environmentContext.serviceContexts, function(serviceContext) {
        winston.info(`Executing pre-deploy on service ${serviceContext.serviceName}`);
        let serviceDeployer = serviceDeployers[serviceContext.serviceType];
        let preDeployPromise = serviceDeployer.preDeploy(serviceContext)
            .then(preDeployContext => {
                if(!(preDeployContext instanceof PreDeployContext)) {
                    throw new Error("Expected PreDeployContext as result from 'preDeploy' phase");
                }
                preDeployContexts[serviceContext.serviceName] = preDeployContext;
            });
        preDeployPromises.push(preDeployPromise);
    });

    return Promise.all(preDeployPromises)
        .then(() => {
            return preDeployContexts; //This was built up dynamically above
        });
}
