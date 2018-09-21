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

import * as fs from 'fs-extra';
import { Extension, ExtensionContext } from 'handel-extension-api';
import * as path from 'path';
import { LoadedExtension } from '../datatypes';

export const STDLIB_PREFIX = '__STDLIB__';

export async function loadStandardLib(): Promise<LoadedExtension> {
    return {
        name: 'handel-stdlib',
        prefix: STDLIB_PREFIX,
        instance: new StandardLibExtension()
    };
}

export class StandardLibExtension implements Extension {
    public async loadHandelExtension(context: ExtensionContext) {
        for (const service of await listDefaultServices()) {
            const module = await import(service.path);
            context.service(service.name, new module.Service());
        }
    }
}

export interface DefaultService {
    name: string;
    path: string;
}

export async function listDefaultServices(): Promise<DefaultService[]> {
    const servicesPath = __dirname;
    const serviceTypes = await fs.readdir(servicesPath);

    const result = [];
    for (const serviceType of serviceTypes) {
        const servicePath = path.join(servicesPath, serviceType);
        if ((await fs.lstat(servicePath)).isDirectory()) {
            result.push({
                name: serviceType,
                path: servicePath,
            });
        }
    }
    return result;
}
