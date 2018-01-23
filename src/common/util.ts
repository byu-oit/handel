/*
 * Copyright 2017 Brigham Young University
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
import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { ncp } from 'ncp';
import pascalCase = require('pascal-case');
import * as path from 'path';
import * as winston from 'winston';
import { AccountConfig, HandelFile, ServiceDeployers } from '../datatypes';

export function readDirSync(filePath: string) {
    try {
        return fs.readdirSync(filePath);
    }
    catch (e) {
        winston.error(`Couldn't read directory: ` + e);
        return null;
    }
}

export function readFileSync(filePath: string): any {
    try {
        return fs.readFileSync(filePath, 'utf8');
    }
    catch (e) {
        winston.error(`Couldn't load file: ` + e);
        return null;
    }
}

export function writeFileSync(filePath: string, data: any) {
    try {
        fs.writeFileSync(filePath, data);
        return data;
    }
    catch (e) {
        winston.error(`Couldn't write file: ` + e);
        return null;
    }
}

export function readJsonFileSync(filePath: string): any {
    try {
        const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return doc;
    }
    catch (e) {
        winston.error(`Couldn't load JSON file: ` + e);
        return null;
    }
}

/**
 * Reads the contents of a YAML file in a synchronous manner. Don't
 * use this if you want to load the file with async io!
 */
export function readYamlFileSync(filePath: string): any {
    try {
        const doc = yaml.safeLoad(fs.readFileSync(filePath, 'utf8'));
        return doc;
    }
    catch (e) {
        winston.error(`Couldn't load YAML file: ` + e);
        return null;
    }
}

/**
 * Reads the contents of a YAML file in an async manner.
 * This behaves similar to readYamlFileSync above, but in an async manner
 */
export function readYamlFileAsync(filePath: string): any {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, fileData) => {
            if (!err) {
                try {
                    resolve(yaml.safeLoad(fileData));
                }
                catch (e) {
                    reject(e);
                }
            }
            else {
                reject(err);
            }
        });
    });
}

/**
 * Takes the given directory path and file and replace tags found in the file with
 *   values from the tag list
 */
export function replaceTagInFile(listTag: any, filePath: string, fileName: string) { // TODO - Add type of listTag later
    let readData = readFileSync(`${filePath}/${fileName}`);
    if (!readData) {
        return readData;
    }
    for (const tag of listTag) {
        readData = readData.replace(tag.regex, tag.value);
    }
    return writeFileSync(`${filePath}/${fileName}`, readData);
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

/**
 * Reads all the service deployer modules out of the 'services' directory
 */
export function getServiceDeployers(): ServiceDeployers {
    const deployers: ServiceDeployers = {};

    const servicesPath = path.join(__dirname, '../services');
    const serviceTypes = fs.readdirSync(servicesPath);
    serviceTypes.forEach(serviceType => {
        const servicePath = `${servicesPath}/${serviceType}`;
        if (fs.lstatSync(servicePath).isDirectory()) {
            deployers[serviceType] = require(servicePath);
        }
    });

    return deployers;
}

/**
 * Given two service names, one binding to another, return a string representing the bind.
 */
export function getBindContextName(bindServiceName: string, dependentServiceName: string): string {
    return `${dependentServiceName}->${bindServiceName}`;
}

/**
 * Given two service names, one consuming events from another, return a string representing the consumption.
 */
export function getConsumeEventsContextName(consumerServiceName: string, producerServiceName: string): string {
    return `${consumerServiceName}->${producerServiceName}`;
}

/**
 * Given two service names, one producing events for another, return a string representing the production.
 */
export function getProduceEventsContextName(producerServiceName: string, consumerServiceName: string): string {
    return `${producerServiceName}->${consumerServiceName}`;
}

/**
 * Given a Handel file object, returns the parser object for that Handel file version
 */
export function getHandelFileParser(handelFile: HandelFile) {
    const handelFileVersion = handelFile.version;
    const handelFileParserFilename = `../handelfile/parser-v${handelFileVersion}`;
    let handelFileParser;
    try {
        handelFileParser = require(handelFileParserFilename);
        return handelFileParser;
    }
    catch (versionError) {
        winston.error(`Invalid deploy spec version: ${handelFile.version}`);
        return null;
    }
}

/**
 * Gets the App Context from the deploy spec file
 */
export function createEnvironmentContext(handelFile: HandelFile, handelFileParser: any, environmentName: string, accountConfig: AccountConfig) { // TODO - Add type for HandelFileParser
    try {
        return handelFileParser.createEnvironmentContext(handelFile, environmentName, accountConfig);
    }
    catch (err) {
        winston.error(`Error while parsing deploy spec: ${err.message}`);
        return null;
    }
}

export function configureAwsSdk(accountConfig: AccountConfig): void {
    AWS.config.update({
        region: accountConfig.region,
        maxRetries: 10
    });
}

/**
 * This nice function came from https://stackoverflow.com/questions/11293857/fastest-way-to-copy-file-in-node-js
 */
export function copyFile(source: string, target: string) {
    return new Promise((resolve, reject) => {
        const rd = fs.createReadStream(source);
        rd.on('error', rejectCleanup);
        const wr = fs.createWriteStream(target);
        wr.on('error', rejectCleanup);
        function rejectCleanup(err: any) {
            rd.destroy();
            wr.end();
            reject(err);
        }
        wr.on('finish', resolve);
        rd.pipe(wr);
    });
}

export function copyDirectory(sourceDir: string, targetDir: string) {
    return new Promise((resolve, reject) => {
        ncp(sourceDir, targetDir, (err: any) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(true);
            }
        });
    });
}

/**
 * Courtesy of https://stackoverflow.com/a/32197381/1031406
 */
export function deleteFolderRecursive(dirPath: string) {
    if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach((file, index) => {
            const curPath = dirPath + '/' + file;
            if (fs.lstatSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(dirPath);
    }
}

/**
 * Turns a string into a valid CloudFormation Logical ID
 * @param id
 * @returns {string}
 */
export function normalizeLogicalId(id: string) {
    return pascalCase(id, undefined, true);
}
