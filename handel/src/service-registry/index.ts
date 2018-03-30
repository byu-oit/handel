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

import * as path from 'path';
import {ServiceDeployer} from '../datatypes';
import {ExtensionDefinition, ExtensionInstantiator, IServiceRegistry} from './types';

import * as log from 'winston';
import defaultInstantiator from './default-instantiator';

export const DEFAULT_EXTENSION_PREFIX = '__DEFAULT__';

export * from './types';

class ServiceRegistry implements IServiceRegistry {

    private readonly deployers: Map<string, Map<string, ServiceDeployer>>;
    private readonly extensions: Map<string, ExtensionDefinition>;

    constructor(extensions: ExtensionDefinition[], private readonly instantiator: ExtensionInstantiator) {
        const deployers = new Map<string, Map<string, ServiceDeployer>>();
        const extensionMap = new Map<string, ExtensionDefinition>();

        for (const extension of extensions) {
            extensionMap.set(extension.prefix, extension);
        }
        this.deployers = deployers;
        this.extensions = extensionMap;
    }

    /**
     * Lazily-loads the requested deployer
     * @param {string} prefix
     * @param {string} name
     * @returns {Promise<ServiceDeployer>}
     */
    public async findDeployerFor(prefix: string, name: string): Promise<ServiceDeployer> {
        const extension = this.extensions.get(prefix);
        if (!extension) {
            throw new Error('Invalid extension prefix: ' + prefix);
        }

        let deployers = this.deployers.get(prefix);
        if (!deployers) {
            deployers = await this.instantiator(extension);
            this.deployers.set(name, deployers);
        }

        if (!deployers.has(name)) {
            throw new Error(`No service named ${name} found in extension ${extension.name}`);
        }
        return deployers.get(name) as ServiceDeployer;
    }

    public validPrefixes(): Set<string> {
        return new Set(this.extensions.keys());
    }
}

export async function init(
    definitions: ExtensionDefinition[] = [],
    instantiator: ExtensionInstantiator = defaultInstantiator
): Promise<ServiceRegistry> {
    definitions.push({
        name: 'Handel Standard Services',
        prefix: DEFAULT_EXTENSION_PREFIX,
        path: path.resolve(__dirname, '../services/default-services-extension')
    });

    return new ServiceRegistry(definitions, instantiator);
}
