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
import * as _ from 'lodash';
import * as winston from 'winston';
import { EnvironmentContext, ServiceConfig, ServiceContext, ServiceDeployers } from '../datatypes/index';

export function checkServices(serviceDeployers: ServiceDeployers, environmentContext: EnvironmentContext): string[] {
    winston.info(`Checking services in environment ${environmentContext.environmentName}`);
    // Run check on all services in environment to make sure params are valid
    let errors: string[] = [];
    _.forEach(environmentContext.serviceContexts, (serviceContext: ServiceContext<ServiceConfig>) => {
        const serviceDeployer = serviceDeployers[serviceContext.serviceType];
        if(serviceDeployer.check) {
            const dependenciesServiceContexts = getDependenciesServiceContexts(serviceContext, environmentContext);
            const checkErrors = serviceDeployer.check(serviceContext, dependenciesServiceContexts);
            errors = errors.concat(checkErrors);
        }
    });
    return errors;
}

function getDependenciesServiceContexts(serviceContext: ServiceContext<ServiceConfig>, environmentContext: EnvironmentContext): Array<ServiceContext<ServiceConfig>> {
    const dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>> = [];
    if(serviceContext.params.dependencies) {
        serviceContext.params.dependencies.forEach((dependency) => {
            dependenciesServiceContexts.push(environmentContext.serviceContexts[dependency]);
        });
    }
    return dependenciesServiceContexts;
}
