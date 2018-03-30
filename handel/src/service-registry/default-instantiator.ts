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

import {Extension, ExtensionContext} from 'handel-extension-api';
import {ServiceDeployer} from '../datatypes';
import {ExtensionDefinition} from './types';

export default async function intantiate(definition: ExtensionDefinition): Promise<Map<string, ServiceDeployer>> {
    const extension = await import(definition.path) as Extension;

    const ctx = new MapExtensionContext();

    await extension.loadHandelExtension(ctx);

    return ctx.map;
}

class MapExtensionContext implements ExtensionContext {
    public readonly map = new Map<string, ServiceDeployer>();

    public service(name: string, deployer: ServiceDeployer): this {
        this.map.set(name, deployer);
        return this;
    }

}
