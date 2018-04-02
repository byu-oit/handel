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

import { stripIndent } from 'common-tags';
import {Extension, ExtensionContext} from 'handel-extension-api';
import * as log from 'winston';
import {ServiceDeployer} from '../datatypes';
import {ExtensionDefinition, LoadedExtension} from './types';

export default async function loadExtension(definition: ExtensionDefinition): Promise<LoadedExtension> {
    log.debug(`Loading extension ${definition.name} as ${definition.prefix} from ${definition.path}`);
    try {
        const extension = await import(definition.path) as Extension;

        const ctx = new MapExtensionContext();

        await extension.loadHandelExtension(ctx);

        return {
            extension,
            services: ctx.services
        };
    } catch (err) {
        throw new ExtensionLoadingError(definition, err);
    }
}

class ExtensionLoadingError extends Error {
    constructor(public readonly definition: ExtensionDefinition, cause: Error) {
        super(stripIndent`
        Error loading extension ${definition.name}: ${cause.message}

        !!! THIS IS MOST LIKELY A PROBLEM WITH THE EXTENSION, NOT WITH HANDEL !!!

        Please check that the extension name and version are correct in your handel.yml.
        If problems perist, contact the maintainer of the extension.

        Full stack trace of the error:
        ${cause.stack}
        `);
    }
}

class MapExtensionContext implements ExtensionContext {
    public readonly services = new Map<string, ServiceDeployer>();

    public service(name: string, deployer: ServiceDeployer): this {
        this.services.set(name, deployer);
        return this;
    }

}
