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
import { isUnPreDeployContext, ServiceRegistry } from 'handel-extension-api';
import * as winston from 'winston';
import * as lifecyclesCommon from '../common/lifecycles-common';
import { DontBlameHandelError, EnvironmentContext, UnPreDeployContexts } from '../datatypes';

export async function unPreDeployServices(serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext): Promise<UnPreDeployContexts> {
    winston.info(`Executing UnPreDeploy phase in environment '${environmentContext.environmentName}'`);
    const unPreDeployPromises: Array<Promise<void>> = [];
    const unPreDeployContexts: UnPreDeployContexts = {};

    for (const serviceName in environmentContext.serviceContexts) {
        if (environmentContext.serviceContexts.hasOwnProperty(serviceName)) {
            const serviceContext = environmentContext.serviceContexts[serviceName];

            const serviceDeployer = serviceRegistry.getService(serviceContext.serviceType);
            if (serviceDeployer.unPreDeploy) {
                winston.info(`UnPreDeploying service ${serviceName}`);
                const unPreDeployPromise = serviceDeployer.unPreDeploy(serviceContext)
                    .then(unPreDeployContext => {
                        if (!isUnPreDeployContext(unPreDeployContext)) {
                            throw new DontBlameHandelError(`Expected PreDeployContext as result from 'preDeploy' phase`, serviceContext.serviceType);
                        }
                        unPreDeployContexts[serviceContext.serviceName] = unPreDeployContext;
                    });
                unPreDeployPromises.push(unPreDeployPromise);
            }
            else { // If deployer doesnt implement preDeploy, just return empty predeploy context
                const unPreDeployPromise = lifecyclesCommon.unPreDeployNotRequired(serviceContext)
                    .then(unPreDeployContext => {
                        unPreDeployContexts[serviceContext.serviceName] = unPreDeployContext;
                    });
                unPreDeployPromises.push(unPreDeployPromise);
            }
        }
    }

    await Promise.all(unPreDeployPromises);
    return unPreDeployContexts; // This was built up dynamically above
}
