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
import * as winston from 'winston';
import * as lifecyclesCommon from '../common/lifecycles-common';
import { EnvironmentContext, ServiceDeployers, UnPreDeployContext, UnPreDeployContexts } from '../datatypes';

export async function unPreDeployServices(serviceDeployers: ServiceDeployers, environmentContext: EnvironmentContext): Promise<UnPreDeployContexts> {
    winston.info(`Executing UnPreDeploy on services in environment ${environmentContext.environmentName}`);
    const unPreDeployPromises: Array<Promise<void>> = [];
    const unPreDeployContexts: UnPreDeployContexts = {};

    for (const serviceName in environmentContext.serviceContexts) {
        if (environmentContext.serviceContexts.hasOwnProperty(serviceName)) {
            const serviceContext = environmentContext.serviceContexts[serviceName];
            winston.debug(`Executing UnPreDeploy on service ${serviceName}`);
            const serviceDeployer = serviceDeployers[serviceContext.serviceType];
            if (serviceDeployer.unPreDeploy) {
                const unPreDeployPromise = serviceDeployer.unPreDeploy(serviceContext)
                    .then(unPreDeployContext => {
                        if (!(unPreDeployContext instanceof UnPreDeployContext)) {
                            throw new Error(`Expected PreDeployContext as result from 'preDeploy' phase`);
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
