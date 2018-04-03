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

import { Extension, ExtensionContext, ServiceRegistry, ServiceType as IServiceType } from 'handel-extension-api';
import {
    ExtensionLoadingError,
    LoadedExtension,
    MissingDeployerError,
    MissingPrefixError,
    ServiceDeployer,
    ServiceType
} from '../datatypes';

/**
 * @deprecated
 * @type {string}
 */
export const DEFAULT_EXTENSION_PREFIX = '__STDLIB__';

export async function initServiceRegistry(
    extensions: LoadedExtension[]
): Promise<ServiceRegistry> {
    const map = new Map<string, ExtensionInstance>();

    for (const ext of extensions) {
        try {
            map.set(ext.prefix, await load(ext.name, ext.instance));
        } catch (err) {
            throw new ExtensionLoadingError(ext.name, err);
        }
    }
    return new MapServiceRegistry(map);
}

async function load(name: string, extension: Extension): Promise<ExtensionInstance> {
    const context = new MapExtensionContext();
    await extension.loadHandelExtension(context);
    return {
        name,
        instance: extension,
        services: context.services
    };
}

class MapServiceRegistry implements ServiceRegistry {

    constructor(private readonly extensions: Map<string, ExtensionInstance>) {
    }

    public getService(type: IServiceType): ServiceDeployer;
    public getService(prefix: string, name: string): ServiceDeployer;
    public getService(typeOrPrefix: IServiceType | string, nameArg?: string): ServiceDeployer {
        const {prefix, name} = parseArgs(typeOrPrefix, nameArg);

        const extension = this.extensions.get(prefix);
        if (!extension) {
            throw new MissingPrefixError(prefix);
        }

        if (!extension.services.has(name)) {
            throw new MissingDeployerError(name, extension.name);
        }
        return extension.services.get(name) as ServiceDeployer;
    }

    public hasService(type: IServiceType): boolean ;
    public hasService(prefix: string, name: string): boolean ;
    public hasService(typeOrPrefix: IServiceType | string, nameArg?: string): boolean {
        const {prefix, name} = parseArgs(typeOrPrefix, nameArg);
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

function parseArgs(typeOrPrefix: IServiceType | string, nameArg: string | undefined): IServiceType {
    if (typeof typeOrPrefix === 'string') {
        return new ServiceType(typeOrPrefix, nameArg as string);
    }
    return typeOrPrefix;
}

class ExtensionInstance {
    constructor(
        public readonly name: string,
        public readonly instance: Extension,
        public readonly services: Map<string, ServiceDeployer>,
    ) {
    }
}

class MapExtensionContext implements ExtensionContext {
    public readonly services = new Map<string, ServiceDeployer>();

    public service(name: string, deployer: ServiceDeployer): this {
        this.services.set(name, deployer);
        return this;
    }

}
