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
    ExtensionDefinition, ExtensionInstallationError,
    ExtensionLoadingError,
    HandelCoreOptions,
    InvalidExtensionSpecificationError,
    isFileExtension, isGitExtension,
    isNpmExtension,
    LoadedExtension
} from '../datatypes';
import { CliNpmClient, InstalledPackage, LinkedPackage, NpmClient } from './npm';
import { ExtensionLoader } from './types';

export class NpmLoader implements ExtensionLoader {

    constructor(private readonly client: NpmClient, private readonly importer: ModuleImporter) {
    }

    public async loadExtensions(
        definitions: ExtensionDefinition[],
        options: HandelCoreOptions,
        workingDirectory: string = process.cwd(),
        extensionsDirectory: string = path.join(workingDirectory, '.handel-extensions')): Promise<LoadedExtension[]> {
        if (definitions.length === 0) {
            return [];
        }
        log.info('Loading Handel Extensions');

        await this.initExtensionsDir(workingDirectory, extensionsDirectory);

        const specs = await this.getInstallSpecs(definitions, workingDirectory, extensionsDirectory, options.linkExtensions);

        let installed: InstalledPackage[];

        try {
            installed = await this.client.installAll(extensionsDirectory, specs.map(it => it.spec), true);
        } catch (err) {
            throw new ExtensionInstallationError(
                definitions,
                err.stderr ? err.stderr.toString() : '--- No Output ---'
            );
        }

        specs.forEach(it => {
            if (it.name) { return; }
            const found = installed.find(i => i.version === it.spec);
            if (!found) {
                throw new InvalidExtensionSpecificationError(it.spec, `Unable to find name for extension ${it.prefix}`);
            }
            it.name = found.name;
        });

        return Promise.all(specs.map(async (defn) => {
            log.debug(`Loading extension '${defn.name}'`);
            const extensionDir = path.join(extensionsDirectory, 'node_modules', defn.name);
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

    private async getInstallSpecs(definitions: ExtensionDefinition[], workingDirectory: string, extensionsDirectory: string, linkExtensions: boolean) {
        let linkables: LinkedPackage[] = [];
        if (linkExtensions) {
            linkables = await this.client.listLinkedPackages();
        }

        const specs = [];
        for (const defn of definitions) {
            let spec: string;
            let name: string = '';
            if (isNpmExtension(defn)) {
                const linked = linkables.find(it => it.name === defn.name);
                if (linked) {
                    log.warn(`Linking extension ${defn.name} to ${linked.path}`);
                    spec = 'file:' + linked.path;
                } else {
                    spec = defn.name + '@' + defn.versionSpec;
                }
                name = defn.name;
            } else if (isFileExtension(defn)) {
                spec = 'file:' + await processFileVersionPath(defn.spec, defn.path, workingDirectory, extensionsDirectory);
            } else if (isGitExtension(defn)) {
                spec = defn.url;
            } else {
                spec = defn.spec;
            }

            specs.push({
                spec,
                name,
                prefix: defn.prefix,
            });
        }

        return specs;
    }

    private async initExtensionsDir(workingDirectory: string, extensionsDirectory: string) {
        await fs.ensureDir(extensionsDirectory);

        const packageJson = path.join(extensionsDirectory, 'package.json');

        await fs.writeJSON(packageJson, {
            name: 'handel-extensions-aggregator',
            description: '!!! Internal Handel use only !!!',
            private: true
        }, {spaces: 2});
    }
}

export type ModuleImporter = (path: string) => Promise<Extension>;

async function processFileVersionPath(spec: string, filePath: string, workingDir: string, extensionsDir: string): Promise<string> {
    const resolved = path.resolve(workingDir, filePath);

    if (path.posix.isAbsolute(filePath) || path.win32.isAbsolute(filePath)) {
        throw new InvalidExtensionSpecificationError(spec, `'file:' versions cannot specify an absolute path.`);
    }

    if (!resolved.startsWith(path.resolve(workingDir))) {
        throw new InvalidExtensionSpecificationError(spec, `'file:' versions cannot specify a path outside of the project root.`);
    }

    if (!(await fs.pathExists(resolved))) {
        throw new InvalidExtensionSpecificationError(spec, 'The specified path does not exist or is not readable by Handel.');
    }

    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
        throw new InvalidExtensionSpecificationError(spec, `'file:' version paths must resolve to a directory.`);
    }

    return path.relative(extensionsDir, resolved);
}

export function initNpmLoader(npmClient: NpmClient = new CliNpmClient(), moduleImporter: ModuleImporter = defaultModuleImporter) {
    return new NpmLoader(npmClient, moduleImporter);
}

async function defaultModuleImporter(modulePath: string): Promise<Extension> {
    return import(modulePath);
}
