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
import { DeployOrder, EnvironmentContext, UnBindContext, UnBindContexts } from '../datatypes';
import {DEFAULT_EXTENSION_PREFIX} from '../service-registry';

export async function unBindServicesInLevel(serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext, deployOrder: DeployOrder, level: number): Promise<UnBindContexts> {
    const unBindPromises: Array<Promise<void>> = [];
    const unBindContexts: UnBindContexts = {};

    const currentLevelServicesToUnBind = deployOrder[level];
    winston.info(`Running UnBind on service dependencies (if any) in level ${level} for services ${currentLevelServicesToUnBind.join(', ')}`);
    for(const toUnBindServiceName of currentLevelServicesToUnBind) {
        const toUnBindServiceContext = environmentContext.serviceContexts[toUnBindServiceName];
        const serviceDeployer = serviceRegistry.findDeployerFor(DEFAULT_EXTENSION_PREFIX, toUnBindServiceContext.serviceType);

        winston.debug(`UnBinding service ${toUnBindServiceName}`);
        if (serviceDeployer.unBind) {
            const unBindPromise = serviceDeployer.unBind(toUnBindServiceContext)
                .then(unBindContext => {
                    if (!(unBindContext instanceof UnBindContext)) {
                        throw new Error(`Expected UnBindContext back from 'unBind' phase of service deployer`);
                    }
                    unBindContexts[toUnBindServiceName] = unBindContext;
                });
            unBindPromises.push(unBindPromise);
        }
        else { // If unbind not implemented by deployer, return an empty unbind context
            const unBindPromise = lifecyclesCommon.unBindNotRequired(toUnBindServiceContext)
                .then(unBindContext => {
                    unBindContexts[toUnBindServiceName] = unBindContext;
                });
            unBindPromises.push(unBindPromise);
        }
    }

    await Promise.all(unBindPromises);
    return unBindContexts; // This was built up dynamically above
}
