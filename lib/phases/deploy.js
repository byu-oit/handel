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
const _ = require('lodash');
const winston = require('winston');
const DeployContext = require('../datatypes/deploy-context');
const lifecyclesCommon = require('../common/lifecycles-common');

function getDependencyDeployContexts(toDeployServiceContext, toDeployPreDeployContext, environmentContext, deployContexts, serviceDeployers) {
    let dependenciesDeployContexts = [];

    let serviceToDeployDependencies = toDeployServiceContext.params.dependencies
    if (serviceToDeployDependencies && serviceToDeployDependencies.length > 0) {
        _.forEach(serviceToDeployDependencies, function (serviceDependencyName) {
            if (!environmentContext.serviceContexts[serviceDependencyName]) {
                throw new Error(`Invalid service dependency: ${serviceDependencyName}`);
            }
            dependenciesDeployContexts.push(deployContexts[serviceDependencyName]);
        });
    }

    return dependenciesDeployContexts;
}

exports.deployServicesInLevel = function (serviceDeployers, environmentContext, preDeployContexts, deployContexts, deployOrder, level) {
    let serviceDeployPromises = [];
    let levelDeployContexts = {};

    var currentLevelElements = deployOrder[level];
    winston.info(`Deploying level ${level} of services: ${currentLevelElements.join(', ')}`);
    for (let i = 0; i < currentLevelElements.length; i++) {
        //Get ServiceContext and PreDeployContext for service being deployed
        let toDeployServiceName = currentLevelElements[i]
        let toDeployServiceContext = environmentContext.serviceContexts[toDeployServiceName];
        let toDeployPreDeployContext = preDeployContexts[toDeployServiceName];

        let serviceDeployer = serviceDeployers[toDeployServiceContext.serviceType];

        //Get all the DeployContexts for services that this service being deployed depends on
        let dependenciesDeployContexts = getDependencyDeployContexts(toDeployServiceContext, toDeployPreDeployContext, environmentContext, deployContexts, serviceDeployers)
        winston.debug(`Deploying service ${toDeployServiceName}`);
        if (serviceDeployer.deploy) {
            let serviceDeployPromise = serviceDeployer.deploy(toDeployServiceContext, toDeployPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    if (!(deployContext instanceof DeployContext)) {
                        throw new Error("Expected DeployContext as result from 'deploy' phase");
                    }
                    levelDeployContexts[toDeployServiceName] = deployContext;
                });
            serviceDeployPromises.push(serviceDeployPromise);
        }
        else {
            let serviceDeployPromise = lifecyclesCommon.deployNotRequired(toDeployServiceContext)
                .then(deployContext => {
                    levelDeployContexts[toDeployServiceName] = deployContext;
                });
            serviceDeployPromises.push(serviceDeployPromise);
        }
    }

    return Promise.all(serviceDeployPromises)
        .then(() => {
            return levelDeployContexts; //This was built up at each deploy above
        });
}