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
const BindContext = require('../datatypes/bind-context');

function getDependentServicesForCurrentBindService(environmentContext, toBindServiceName) {
    let dependentServices = [];
    for (let currentServiceName in environmentContext.serviceContexts) {
        let currentService = environmentContext.serviceContexts[currentServiceName];
        let currentServiceDeps = currentService.params.dependencies;
        if (currentServiceDeps && currentServiceDeps.includes(toBindServiceName)) {
            dependentServices.push(currentServiceName);
        }
    }
    return dependentServices;
}

exports.bindServicesInLevel = function (serviceDeployers, environmentContext, preDeployContexts, deployOrder, levelToBind) {
    let bindPromises = [];
    let levelBindContexts = {};

    let currentLevelServicesToBind = deployOrder[levelToBind];
    winston.info(`Executing bind (if any) on service dependencies on level ${levelToBind} for services ${currentLevelServicesToBind.join(', ')}`);
    for (let i = 0; i < currentLevelServicesToBind.length; i++) {
        let toBindServiceName = currentLevelServicesToBind[i];

        //Get ServiceContext and PreDeployContext for the service to call bind on
        let toBindServiceContext = environmentContext.serviceContexts[toBindServiceName];
        let toBindPreDeployContext = preDeployContexts[toBindServiceName];
        let serviceDeployer = serviceDeployers[toBindServiceContext.serviceType];

        //This service may have multiple services dependening on it, run bind on each of them
        for (let dependentOfServiceName of getDependentServicesForCurrentBindService(environmentContext, toBindServiceName)) {
            //Get ServiceContext and PreDeployContext for the service dependency
            let dependentOfServiceContext = environmentContext.serviceContexts[dependentOfServiceName];
            let dependentOfPreDeployContext = preDeployContexts[dependentOfServiceName];

            //Run bind on the service combination
            let bindContextName = util.getBindContextName(toBindServiceName, dependentOfServiceName)
            winston.info(`Binding service ${bindContextName}`);
            let bindPromise = serviceDeployer.bind(toBindServiceContext, toBindPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext)
                .then(bindContext => {
                    if (!(bindContext instanceof BindContext)) {
                        throw new Error("Expected BindContext back from 'bind' phase of service deployer");
                    }
                    levelBindContexts[bindContextName] = bindContext;
                });
            bindPromises.push(bindPromise);
        }
    }

    return Promise.all(bindPromises)
        .then(() => {
            return levelBindContexts; //This was built up at each bind above
        });
}