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
import * as archiver from 'archiver';
import * as extractZip from 'extract-zip';
import * as fs from 'fs';
import pascalCase = require('pascal-case');

/**
 * Turns a string into a valid CloudFormation Logical ID
 * @param id
 * @returns {string}
 */
export function normalizeLogicalId(id: string) {
    return pascalCase(id, undefined, true);
}

/**
 * Takes the given directory path and zips it up and stores it
 *   in the given file path
 */
export function zipDirectoryToFile(directoryPath: string, filePath: string) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(directoryPath)) {
            throw new Error(`Directory path to be zipped does not exist: ${directoryPath}`);
        }

        const archive = archiver.create('zip', {});
        const output = fs.createWriteStream(filePath);
        archive.pipe(output);
        archive.directory(directoryPath, ''); // The 2nd param makes all the files just be included at the root with no directory
        archive.finalize();
        output.on('close', () => {
            resolve();
        });
        output.on('error', (err) => {
            reject(err);
        });
    });
}

export function unzipFileToDirectory(filePath: string, directoryPath: string) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) {
            return reject(new Error(`File path to be unzipped does not exist: ${filePath}`));
        }
        extractZip(filePath, { dir: directoryPath }, (err: any) => {
            if (err) {
                return reject(new Error(`Unzippiing ${filePath} was unsuccessful: ${err}`));
            }
            return resolve();
        });
    });
}
