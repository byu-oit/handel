/*
 * Copyright 2018 Brigham Young University
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import * as fs from 'fs';
import { EbextensionsToInject } from './config-types';

function createEbExtensionsDirIfNotExists(ebextensionsDir: string): void {
    if (!fs.existsSync(ebextensionsDir)) {
        fs.mkdirSync(ebextensionsDir);
    }
}

function deleteEbextensionsDirIfEmpty(ebextensionsDir: string): void {
    const filenames = fs.readdirSync(ebextensionsDir);
    if (filenames.length === 0) {
        fs.rmdirSync(ebextensionsDir);
    }
}

/**
 * Given a list of ebextensions, adds them to the given archive
 *
 * @param {Object} ebextensions - The list of ebextensions files as strings
 * @param {String} archivePath - The path to the archive file to add them to.
 */
export function addEbextensionsToDir(ebextensions: EbextensionsToInject, artifactDir: string) {
    const ebextensionsPath = `${artifactDir}/.ebextensions`;
    createEbExtensionsDirIfNotExists(ebextensionsPath);
    for (const ebextensionFileName in ebextensions) {
        if (ebextensions.hasOwnProperty(ebextensionFileName)) {
            const ebextensionContent = ebextensions[ebextensionFileName];
            const ebextensionPath = `${ebextensionsPath}/${ebextensionFileName}`;
            fs.writeFileSync(ebextensionPath, ebextensionContent);
        }
    }
    return true;
}

export function deleteAddedEbExtensionsFromDirectory(ebextensions: EbextensionsToInject, artifactDir: string) {
    const ebextensionsPath = `${artifactDir}/.ebextensions`;
    for (const ebextensionFileName in ebextensions) {
        if (ebextensions.hasOwnProperty(ebextensionFileName)) {
            const ebextensionPath = `${ebextensionsPath}/${ebextensionFileName}`;
            fs.unlinkSync(ebextensionPath);
        }
    }
    deleteEbextensionsDirIfEmpty(ebextensionsPath);
    return true;
}
