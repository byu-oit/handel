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
import { isPreDeployContext, ServiceRegistry } from 'handel-extension-api';
import * as winston from 'winston';
import * as lifecyclesCommon from '../common/lifecycles-common';
import { DontBlameHandelError, EnvironmentContext, PreDeployContexts } from '../datatypes';

export async function preDeployServices(serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext): Promise<PreDeployContexts> {
    winston.info(`Executing PreDeploy phase in environment '${environmentContext.environmentName}'`);
    const preDeployPromises: Array<Promise<void>> = [];
    const preDeployContexts: PreDeployContexts = {};

    for (const serviceName in environmentContext.serviceContexts) {
        if (environmentContext.serviceContexts.hasOwnProperty(serviceName)) {
            const serviceContext = environmentContext.serviceContexts[serviceName];
            winston.info(`Executing pre-deploy on service ${serviceContext.serviceName}`);
            const serviceDeployer = serviceRegistry.getService(serviceContext.serviceType);
            if (serviceDeployer.preDeploy) {
                const preDeployPromise = serviceDeployer.preDeploy(serviceContext)
                    .then(preDeployContext => {
                        if (!isPreDeployContext(preDeployContext)) {
                            throw new DontBlameHandelError('Expected PreDeployContext as result from \'preDeploy\' phase', serviceContext.serviceType);
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

export async function getPreDeployContexts(serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext): Promise<PreDeployContexts> {
    const preDeployPromises: Array<Promise<void>> = [];
    const preDeployContexts: PreDeployContexts = {};

    for (const serviceName in environmentContext.serviceContexts) {
        if (environmentContext.serviceContexts.hasOwnProperty(serviceName)) {
            const serviceContext = environmentContext.serviceContexts[serviceName];
            winston.info(`Executing getPreDeployContexts on service ${serviceContext.serviceName}`);
            const serviceDeployer = serviceRegistry.getService(serviceContext.serviceType);
            if (serviceDeployer.preDeploy) {
                if(!serviceDeployer.getPreDeployContext) {
                    throw new DontBlameHandelError(`Expected getPreDeployContext to be implemented by service deployer`, serviceContext.serviceType);
                }

                const preDeployPromise = serviceDeployer.getPreDeployContext(serviceContext)
                    .then(preDeployContext => {
                        if (!isPreDeployContext(preDeployContext)) {
                            throw new DontBlameHandelError('Expected PreDeployContext as result from \'preDeploy\' phase', serviceContext.serviceType);
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
