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
import * as winston from 'winston';
import * as lifecyclesCommon from '../common/lifecycles-common';
import { DeployOrder, EnvironmentContext, ServiceDeployers, UnDeployContext, UnDeployContexts} from '../datatypes';

export async function unDeployServicesInLevel(serviceDeployers: ServiceDeployers, environmentContext: EnvironmentContext, deployOrder: DeployOrder, level: number): Promise<UnDeployContexts> {
    const serviceUnDeployPromises: Array<Promise<void>> = [];
    const levelUnDeployContexts: UnDeployContexts = {};

    const currentLevelElements = deployOrder[level];
    winston.info(`UnDeploying level ${level} of services: ${currentLevelElements.join(', ')}`);
    for(const toUnDeployServiceName of currentLevelElements) {
        const toUnDeployServiceContext = environmentContext.serviceContexts[toUnDeployServiceName];

        const serviceDeployer = serviceDeployers[toUnDeployServiceContext.serviceType];

        winston.debug(`UnDeploying service ${toUnDeployServiceName}`);
        if (serviceDeployer.unDeploy) {
            const serviceUndeployPromise = serviceDeployer.unDeploy(toUnDeployServiceContext)
                .then(unDeployContext => {
                    if (!(unDeployContext instanceof UnDeployContext)) {
                        throw new Error(`Expected UnDeployContext as result from 'unDeploy' phase`);
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
