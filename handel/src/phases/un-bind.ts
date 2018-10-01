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
import { isUnBindContext, ServiceRegistry } from 'handel-extension-api';
import * as winston from 'winston';
import * as lifecyclesCommon from '../common/lifecycles-common';
import { DeployOrder, DontBlameHandelError, EnvironmentContext, PreDeployContexts, UnBindContexts } from '../datatypes';

function getDependentServicesForCurrentUnBindService(environmentContext: EnvironmentContext, toBindServiceName: string): string[] {
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

function getUnBindContextName(unBindServiceName: string, dependentServiceName: string): string {
    return `${dependentServiceName}->${unBindServiceName}`;
}

export async function unBindServicesInLevel(serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext, preDeployContexts: PreDeployContexts, deployOrder: DeployOrder, level: number): Promise<UnBindContexts> {
    const unBindPromises: Array<Promise<void>> = [];
    const unBindContexts: UnBindContexts = {};

    const currentLevelServicesToUnBind = deployOrder[level];
    winston.info(`Executing UnBind phase in level ${level} in environment '${environmentContext.environmentName}' for services ${currentLevelServicesToUnBind.join(', ')}`);
    for (const toUnBindServiceName of currentLevelServicesToUnBind) {
        const toUnBindServiceContext = environmentContext.serviceContexts[toUnBindServiceName];
        const toUnBindPreDeployContext = preDeployContexts[toUnBindServiceName];
        const serviceDeployer = serviceRegistry.getService(toUnBindServiceContext.serviceType);

        for (const dependentOfServiceName of getDependentServicesForCurrentUnBindService(environmentContext, toUnBindServiceName)) {
            // Get ServiceContext for the dependent service
            const dependentOfServiceContext = environmentContext.serviceContexts[dependentOfServiceName];
            const dependentOfPreDeployContext = preDeployContexts[dependentOfServiceName];

            // Run unBind on the service combination (if implemented by the dependency service)
            const unBindContextName = getUnBindContextName(toUnBindServiceName, dependentOfServiceName);
            if (serviceDeployer.unBind) {
                winston.info(`UnBinding service ${toUnBindServiceName}`);
                const unBindPromise = serviceDeployer.unBind(toUnBindServiceContext, toUnBindPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext)
                    .then(unBindContext => {
                        if (!isUnBindContext(unBindContext)) {
                            throw new DontBlameHandelError(`Expected UnBindContext back from 'unBind' phase of service deployer`, toUnBindServiceContext.serviceType);
                        }
                        unBindContexts[unBindContextName] = unBindContext;
                    });
                unBindPromises.push(unBindPromise);
            }
            else { // If unbind not implemented by deployer, return an empty unbind context
                const unBindPromise = lifecyclesCommon.unBindNotRequired(toUnBindServiceContext)
                    .then(unBindContext => {
                        unBindContexts[unBindContextName] = unBindContext;
                    });
                unBindPromises.push(unBindPromise);
            }
        }
    }

    await Promise.all(unBindPromises);
    return unBindContexts; // This was built up dynamically above
}
