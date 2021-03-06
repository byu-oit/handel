/*
 * Copyright 2018 Brigham Young University
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
import { isBindContext } from 'handel-extension-api';
import {ServiceRegistry} from 'handel-extension-api';
import * as winston from 'winston';
import * as lifecyclesCommon from '../common/lifecycles-common';
import * as util from '../common/util';
import { BindContexts, DeployOrder, DontBlameHandelError, EnvironmentContext, PreDeployContexts } from '../datatypes';

function getDependentServicesForCurrentBindService(environmentContext: EnvironmentContext, toBindServiceName: string): string[] {
    const dependentServices = [];
    for (const currentServiceName in environmentContext.serviceContexts) {
        if (environmentContext.serviceContexts.hasOwnProperty(currentServiceName)) {
            const currentService = environmentContext.serviceContexts[currentServiceName];
            const currentServiceDeps = currentService.params.dependencies;
            if (currentServiceDeps && currentServiceDeps.includes(toBindServiceName)) {
                dependentServices.push(currentServiceName);
            }
        }
    }
    return dependentServices;
}

function getBindContextName(bindServiceName: string, dependentServiceName: string): string {
    return `${dependentServiceName}->${bindServiceName}`;
}

export async function bindServicesInLevel(serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext, preDeployContexts: PreDeployContexts, deployOrder: DeployOrder, levelToBind: number): Promise<BindContexts> {
    const bindPromises = [];
    const levelBindContexts: BindContexts = {};

    const currentLevelServicesToBind = deployOrder[levelToBind];
    winston.info(`Executing Bind phase on service dependencies on level ${levelToBind} of environment '${environmentContext.environmentName}' for services ${currentLevelServicesToBind.join(', ')}`);
    for(const toBindServiceName of currentLevelServicesToBind) {
        // Get ServiceContext and PreDeployContext for the service to call bind on
        const toBindServiceContext = environmentContext.serviceContexts[toBindServiceName];
        const toBindPreDeployContext = preDeployContexts[toBindServiceName];
        const serviceDeployer = serviceRegistry.getService(toBindServiceContext.serviceType);

        // This service may have multiple services dependening on it, run bind on each of them
        for (const dependentOfServiceName of getDependentServicesForCurrentBindService(environmentContext, toBindServiceName)) {
            // Get ServiceContext and PreDeployContext for the service dependency
            const dependentOfServiceContext = environmentContext.serviceContexts[dependentOfServiceName];
            const dependentOfPreDeployContext = preDeployContexts[dependentOfServiceName];

            // Run bind on the service combination
            const bindContextName = getBindContextName(toBindServiceName, dependentOfServiceName);
            winston.debug(`Binding service ${bindContextName}`);

            if (serviceDeployer.bind) {
                const bindPromise = serviceDeployer.bind(toBindServiceContext, toBindPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext)
                    .then(bindContext => {
                        if (!isBindContext(bindContext)) {
                            throw new DontBlameHandelError('Expected valid BindContext back from \'bind\' phase of service deployer', toBindServiceContext.serviceType);
                        }
                        levelBindContexts[bindContextName] = bindContext;
                    });
                bindPromises.push(bindPromise);
            }
            else { // If deployer doesn't implement bind, just return an empty BindContext
                const bindPromise = lifecyclesCommon.bindNotRequired(toBindServiceContext, dependentOfServiceContext)
                    .then(bindContext => {
                        levelBindContexts[bindContextName] = bindContext;
                    });
                bindPromises.push(bindPromise);
            }
        }
    }

    await Promise.all(bindPromises);
    return levelBindContexts; // This was built up at each bind above
}
