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
import {ServiceRegistry} from 'handel-extension-api';
import * as winston from 'winston';
import * as lifecyclesCommon from '../common/lifecycles-common';
import { EnvironmentContext, PreDeployContext, PreDeployContexts } from '../datatypes';
import {DEFAULT_EXTENSION_PREFIX} from '../service-registry';

export async function preDeployServices(serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext): Promise<PreDeployContexts> {
    winston.info(`Executing pre-deploy phase on services in environment ${environmentContext.environmentName}`);
    const preDeployPromises: Array<Promise<void>> = [];
    const preDeployContexts: PreDeployContexts = {};

    for (const serviceName in environmentContext.serviceContexts) {
        if (environmentContext.serviceContexts.hasOwnProperty(serviceName)) {
            const serviceContext = environmentContext.serviceContexts[serviceName];
            winston.debug(`Executing pre-deploy on service ${serviceContext.serviceName}`);
            const serviceDeployer = serviceRegistry.findDeployerFor(DEFAULT_EXTENSION_PREFIX, serviceContext.serviceType);
            if (serviceDeployer.preDeploy) {
                const preDeployPromise = serviceDeployer.preDeploy(serviceContext)
                    .then(preDeployContext => {
                        if (!(preDeployContext instanceof PreDeployContext)) {
                            throw new Error('Expected PreDeployContext as result from \'preDeploy\' phase');
                        }
                        preDeployContexts[serviceContext.serviceName] = preDeployContext;
                    });
                preDeployPromises.push(preDeployPromise);
            }
            else { // If deployer doesn't implement preDeploy, then just return an empty PreDeployContext
                const preDeployPromise = lifecyclesCommon.preDeployNotRequired(serviceContext)
                    .then(preDeployContext => {
                        preDeployContexts[serviceContext.serviceName] = preDeployContext;
                    });
                preDeployPromises.push(preDeployPromise);
            }
        }
    }

    await Promise.all(preDeployPromises);
    return preDeployContexts; // This was built up dynamically above
}
