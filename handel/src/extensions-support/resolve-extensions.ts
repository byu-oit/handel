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

import * as log from 'winston';
import { ExtensionDefinition, HandelCoreOptions, LoadedExtension } from '../datatypes';
import { loadStandardLib } from '../services/stdlib';
import { initNpmLoader } from './npm-loader';
import { ExtensionLoader } from './types';

export type StandardLibLoader = () => Promise<LoadedExtension>;

export async function resolveExtensions(
    definitions: ExtensionDefinition[],
    options: HandelCoreOptions,
    loader: ExtensionLoader = initNpmLoader(),
    standardLibLoader: StandardLibLoader | null = loadStandardLib
): Promise<LoadedExtension[]> {
    const loaded: LoadedExtension[] = [];
    if (standardLibLoader) {
        loaded.push(await standardLibLoader());
    }
    loaded.push(... await loader.loadExtensions(definitions, options));
    log.debug('Available Extensions:', loaded.map(e => e.prefix + '::' + e.name).join(','));
    return loaded;
}
