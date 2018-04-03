/*
 *  @license
 *    Copyright 2018 Brigham Young University
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

import { ServiceDeployer, ServiceRegistry, ServiceType } from 'handel-extension-api';
import { STDLIB_PREFIX } from '../../src/services/stdlib';

export interface FakeRegistryInfo {
    [key: string]: Partial<ServiceDeployer>;
}

export default class FakeServiceRegistry implements ServiceRegistry {

    constructor(readonly services: FakeRegistryInfo = {}) {
    }

    public getService(prefix: string, name: string): ServiceDeployer;
    public getService(type: ServiceType): ServiceDeployer;
    public getService(typeOrPrefix: string | ServiceType, nameArg?: string): ServiceDeployer {
        const key = keyFor(typeOrPrefix, nameArg);
        return this.services[key] as ServiceDeployer || {
            consumedDeployOutputTypes: [],
            producedDeployOutputTypes: [],
            producedEventsSupportedServices: []
        };
    }

    public hasService(prefix: string, name: string): boolean;
    public hasService(type: ServiceType): boolean;
    public hasService(typeOrPrefix: string | ServiceType, nameArg?: string): boolean {
        const key = keyFor(typeOrPrefix, nameArg);
        return this.services.hasOwnProperty(key);
    }

    public allPrefixes(): Set<string> {
        return new Set([STDLIB_PREFIX]);
    }

}

function keyFor(typeOrPrefix: string | ServiceType, nameArg?: string): string {
    let prefix: string;
    let name: string;

    if (typeof typeOrPrefix === 'string') {
        prefix = typeOrPrefix;
        name = nameArg as string;
    } else {
        prefix = typeOrPrefix.prefix;
        name = typeOrPrefix.name;
    }
    if (prefix === STDLIB_PREFIX) {
        return name;
    } else {
        return prefix + '::' + name;
    }
}
