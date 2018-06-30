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
import { Extension } from 'handel-extension-api';
import * as path from 'path';
import * as log from 'winston';
import {
    ExtensionDefinition,
    ExtensionInstallationError,
    ExtensionLoadingError,
    HandelCoreOptions,
    LoadedExtension
} from '../datatypes';
import { CliNpmClient, NpmClient } from './npm';
import { ExtensionLoader } from './types';

export class NpmLoader implements ExtensionLoader {

    constructor(private readonly client: NpmClient, private readonly importer: ModuleImporter) {
    }

    public async loadExtensions(
        definitions: ExtensionDefinition[],
        options: HandelCoreOptions,
        directory: string = path.join(process.cwd(), '.handel-extensions')): Promise<LoadedExtension[]> {
        if (definitions.length === 0) {
            return [];
        }
        log.info('Loading Handel Extensions');

        await fs.ensureDir(directory);

        const packageJson = assemblePackageJson(definitions);

        if (options.linkExtensions) {
            log.info('Linking Local Extensions');
            const linkables = await this.client.listLinkedPackages();
            linkables.filter(({name}) => !!packageJson.dependencies[name])
                .forEach(({name, path: linkPath}) => {
                    log.warn(`Linking Extension '${name}' to '${linkPath}'`);
                    return packageJson.dependencies[name] = 'file:' + linkPath;
                });
        }

        await fs.writeJSON(path.join(directory, 'package.json'), packageJson, {spaces: 2});

        log.info('Installing extensions from NPM');

        try {
            await this.client.installAll(directory);
        } catch (err) {
            throw new ExtensionInstallationError(
                definitions,
                err.stderr ? err.stderr.toString() : '--- No Output ---'
            );
        }

        return Promise.all(definitions.map(async (defn) => {
            log.debug(`Loading extension '${defn.name}'`);
            const extensionDir = path.join(directory, 'node_modules', defn.name);
            let instance: Extension;
            try {
                instance = await this.importer(extensionDir);
            } catch (err) {
                log.warn('Error loading extension ' + defn.name, err.message);
                throw new ExtensionLoadingError(defn.name, err);
            }
            log.debug(`Finished loading extension '${defn.name}'`);
            return {
                prefix: defn.prefix,
                name: defn.name,
                instance,
            };
        }));
    }
}

export type ModuleImporter = (path: string) => Promise<Extension>;

function assemblePackageJson(definitions: ExtensionDefinition[]) {
    const deps: any = definitions.reduce((agg, each) => {
        agg[each.name] = each.versionSpec;
        return agg;
    }, {} as any);

    return {
        dependencies: deps,
    };
}

export function initNpmLoader(npmClient: NpmClient = new CliNpmClient(), moduleImporter: ModuleImporter = defaultModuleImporter) {
    return new NpmLoader(npmClient, moduleImporter);
}

async function defaultModuleImporter(modulePath: string): Promise<Extension> {
    return import(modulePath);
}
