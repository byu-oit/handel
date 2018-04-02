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

import {ServiceRegistry as IServiceRegistry} from 'handel-extension-api';
import * as path from 'path';
import { ServiceDeployer } from '../datatypes';
import { ExtensionDefinition, ExtensionLoader, } from './types';

import {stripIndent} from 'common-tags';
import { Extension } from 'handel-extension-api';
import * as log from 'winston';
import { documentationUrl } from '../common/util';
import defaultExtensionLoader from './default-extension-loader';

export const DEFAULT_EXTENSION_PREFIX = '__DEFAULT__';

export const DEFAULT_EXTENSION: ExtensionDefinition = Object.freeze({
    name: 'Handel Standard Services',
    prefix: DEFAULT_EXTENSION_PREFIX,
    path: path.resolve(__dirname, '../services/default-services-extension')
});

export async function initServiceRegistry(
    definitions: ExtensionDefinition[] = [],
    loader: ExtensionLoader = defaultExtensionLoader
): Promise<IServiceRegistry> {

    definitions.push(DEFAULT_EXTENSION);

    const extensions = await Promise.all(definitions.map(async (defn) => {
        const loaded = await loader(defn);
        return {
            meta: defn,
            instance: loaded.extension,
            services: loaded.services
        } as ExtensionInstance;
    }));

    const map = extensions.reduce((map, instance) => {
        return map.set(instance.meta.prefix, instance);
    }, new Map<string, ExtensionInstance>());

    return new ServiceRegistry(map);
}

class ServiceRegistry implements IServiceRegistry {

    constructor(private readonly extensions: Map<string, ExtensionInstance>) {
    }

    public getService(prefix: string, name: string): ServiceDeployer {
        const extension = this.extensions.get(prefix);
        if (!extension) {
            throw new MissingPrefixError(prefix);
        }

        if (!extension.services.has(name)) {
            throw new MissingDeployerError(name, extension.meta.name);
        }
        return extension.services.get(name) as ServiceDeployer;
    }

    public hasService(prefix: string, name: string): boolean {
        const extension = this.extensions.get(prefix);
        if (!extension) {
            return false;
        }
        return extension.services.has(name);
    }

    public allPrefixes(): Set<string> {
        return new Set(this.extensions.keys());
    }
}

class ExtensionInstance {
    constructor(
        public readonly meta: ExtensionDefinition,
        public readonly instance: Extension,
        public readonly services: Map<string, ServiceDeployer>,
    ) {
    }
}

class MissingPrefixError extends Error {
    constructor(public readonly prefix: string) {
        super(stripIndent`
        Unregistered Prefix: '${prefix}'.

        Make sure you have an extension registered with this prefix in your handel.yml:

          extensions:
            ${prefix}: {handel extension package name}

        For more info, visit ${documentationUrl('handel-basics/extensions.html')}
        `);
    }
}

class MissingDeployerError extends Error {
    constructor(
        public readonly name: string,
        public readonly extension: string) {
        super(stripIndent`
            Missing Service: '${name}' in extension '${extension}'

            Check your handel.yml to make sure that you haven't misspelled the service name.
            Check the documentation for ${extension} to ensure it supports the service you are trying to use.
        `);
    }
}
