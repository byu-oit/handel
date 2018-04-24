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
import { isUnDeployContext, ServiceRegistry } from 'handel-extension-api';
import * as winston from 'winston';
import * as lifecyclesCommon from '../common/lifecycles-common';
import { DeployOrder, DontBlameHandelError, EnvironmentContext, UnDeployContexts } from '../datatypes';

export async function unDeployServicesInLevel(serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext, deployOrder: DeployOrder, level: number): Promise<UnDeployContexts> {
    const serviceUnDeployPromises: Array<Promise<void>> = [];
    const levelUnDeployContexts: UnDeployContexts = {};

    const currentLevelElements = deployOrder[level];
    winston.info(`Executing UnDeploy phase on level ${level} in environment '${environmentContext.environmentName}' for services: ${currentLevelElements.join(', ')}`);
    for(const toUnDeployServiceName of currentLevelElements) {
        const toUnDeployServiceContext = environmentContext.serviceContexts[toUnDeployServiceName];

        const serviceDeployer = serviceRegistry.getService(toUnDeployServiceContext.serviceType);

        if (serviceDeployer.unDeploy) {
            winston.info(`UnDeploying service ${toUnDeployServiceName}`);
            const serviceUndeployPromise = serviceDeployer.unDeploy(toUnDeployServiceContext)
                .then(unDeployContext => {
                    if (!isUnDeployContext(unDeployContext)) {
                        throw new DontBlameHandelError(`Expected UnDeployContext as result from 'unDeploy' phase`, toUnDeployServiceContext.serviceType);
                    }
                    levelUnDeployContexts[toUnDeployServiceName] = unDeployContext;
                });
            serviceUnDeployPromises.push(serviceUndeployPromise);
        }
        else {
            const serviceUndeployPromise = lifecyclesCommon.unDeployNotRequired(toUnDeployServiceContext)
                .then(unDeployContext => {
                    levelUnDeployContexts[toUnDeployServiceName] = unDeployContext;
                });
            serviceUnDeployPromises.push(serviceUndeployPromise);
        }
    }

    await Promise.all(serviceUnDeployPromises);
    return levelUnDeployContexts; // This was build up dynamically above
}
