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
import { IDeployContext, IPreDeployContext, isDeployContext, ServiceRegistry } from 'handel-extension-api';
import * as winston from 'winston';
import * as lifecyclesCommon from '../common/lifecycles-common';
import {
    DeployContexts,
    DeployOrder,
    DontBlameHandelError,
    EnvironmentContext,
    PreDeployContexts,
    ServiceConfig,
    ServiceContext
} from '../datatypes';

function getDependencyDeployContexts(toDeployServiceContext: ServiceContext<ServiceConfig>, toDeployPreDeployContext: IPreDeployContext, environmentContext: EnvironmentContext, deployContexts: DeployContexts, serviceRegistry: ServiceRegistry): IDeployContext[] {
    const dependenciesDeployContexts: IDeployContext[] = [];

    const serviceToDeployDependencies: string[] | undefined = toDeployServiceContext.params.dependencies;
    if (serviceToDeployDependencies && serviceToDeployDependencies.length > 0) {
        for(const serviceDependencyName of serviceToDeployDependencies) {
            if (!environmentContext.serviceContexts[serviceDependencyName]) {
                throw new Error(`Invalid service dependency: ${serviceDependencyName}`);
            }
            dependenciesDeployContexts.push(deployContexts[serviceDependencyName]);
        }
    }

    return dependenciesDeployContexts;
}

export async function deployServicesInLevel(serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext, preDeployContexts: PreDeployContexts, deployContexts: DeployContexts, deployOrder: DeployOrder, level: number): Promise<DeployContexts> {
    const serviceDeployPromises = [];
    const levelDeployContexts: DeployContexts = {};

    const currentLevelElements = deployOrder[level];
    winston.info(`Deploying level ${level} of services: ${currentLevelElements.join(', ')}`);
    for(const toDeployServiceName of currentLevelElements) {
        // Get ServiceContext and PreDeployContext for service being deployed
        const toDeployServiceContext = environmentContext.serviceContexts[toDeployServiceName];
        const toDeployPreDeployContext = preDeployContexts[toDeployServiceName];

        const serviceDeployer = serviceRegistry.getService(toDeployServiceContext.serviceType);

        // Get all the DeployContexts for services that this service being deployed depends on
        const dependenciesDeployContexts = getDependencyDeployContexts(toDeployServiceContext, toDeployPreDeployContext, environmentContext, deployContexts, serviceRegistry);
        winston.debug(`Deploying service ${toDeployServiceName}`);
        if (serviceDeployer.deploy) {
            const serviceDeployPromise = serviceDeployer.deploy(toDeployServiceContext, toDeployPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    if (!isDeployContext(deployContext)) {
                        throw new DontBlameHandelError('Expected DeployContext as result from \'deploy\' phase', toDeployServiceContext.serviceType);
                    }
                    levelDeployContexts[toDeployServiceName] = deployContext;
                });
            serviceDeployPromises.push(serviceDeployPromise);
        }
        else {
            const serviceDeployPromise = lifecyclesCommon.deployNotRequired(toDeployServiceContext)
                .then(deployContext => {
                    levelDeployContexts[toDeployServiceName] = deployContext;
                });
            serviceDeployPromises.push(serviceDeployPromise);
        }
    }

    await Promise.all(serviceDeployPromises);
    return levelDeployContexts; // This was built up at each deploy above
}
