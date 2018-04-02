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

import {ServiceDeployer, ServiceRegistry} from 'handel-extension-api';
import {DEFAULT_EXTENSION_PREFIX} from '../../src/service-registry';

export interface FakeRegistryInfo {
    [key: string]: Partial<ServiceDeployer>;
}

export default class FakeServiceRegistry implements ServiceRegistry {

    constructor(readonly services: FakeRegistryInfo = {}) {
    }

    public getService(prefix: string, name: string): ServiceDeployer {
        return this.services[name] as ServiceDeployer || {
            consumedDeployOutputTypes: [],
            producedDeployOutputTypes: [],
            producedEventsSupportedServices: []
        };
    }

    public hasService(prefix: string, name: string): boolean {
        return this.services.hasOwnProperty(name);
    }

    public allPrefixes(): Set<string> {
        return new Set([DEFAULT_EXTENSION_PREFIX]);
    }

}
