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
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const archiver = require('archiver');
const winston = require('winston');
const AWS = require('aws-sdk');
const ncp = require('ncp').ncp;
const pascalCase = require('pascal-case');
ncp.limit = 16;

exports.readDirSync = function (filePath) {
    try {
        return fs.readdirSync(filePath);
    }
    catch (e) {
        winston.error("Couldn't read directory: " + e);
        return null;
    }
};

exports.readFileSync = function (filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    }
    catch (e) {
        winston.error("Couldn't load file: " + e);
        return null;
    }
};

exports.writeFileSync = function (filePath, data) {
    try {
        fs.writeFileSync(filePath, data);
        return data;
    }
    catch (e) {
        winston.error("Couldn't write file: " + e);
        return null;
    }
};

exports.readJsonFileSync = function(filePath) {
    try {
        var doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return doc;
    }
    catch (e) {
        winston.error("Couldn't load JSON file: " + e);
        return null;
    }
}

/**
 * Reads the contents of a YAML file in a synchronous manner. Don't
 * use this if you want to load the file with async io!
 * 
 * @param {String} filePath - The full path to the YAML file on disk to read 
 * @returns {Object} - A Javascript object representing the read YAML file
 */
exports.readYamlFileSync = function (filePath) {
    try {
        var doc = yaml.safeLoad(fs.readFileSync(filePath, 'utf8'));
        return doc;
    }
    catch (e) {
        winston.error("Couldn't load YAML file: " + e);
        return null;
    }
}


/**
 * Reads the contents of a YAML file in an async manner.
 * This behaves similar to readYamlFileSync above, but in an async manner
 * 
 * @param {String} filePath - The full path to the YAML file on disk to read 
 * @returns {Promise.<Object>} - A Promise of an Object representing the read YAML file
 */
exports.readYamlFileAsync = function (filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, fileData) => {
            if (!err) {
                try {
                    resolve(yaml.safeLoad(fileData));
                }
                catch (e) {
                    reject(e)
                }
            }
            else {
                reject(err)
            }
        });
    })
}


/**
 * Takes the given directory path and file and replace tags found in the file with
 *   values from the tag list
 * 
 * @param {Array} listTag - An array of objects containing fields regex: {regex} and value: {String}
 * @param {String} filePath - The full path to the file on disk to do substitutions to
 * @param {String} fileName - The name of the file on disk
 * @returns {Promise.<String>} - A Promise of a String representing the contents of fileName with substitutions
 */
exports.replaceTagInFile = function (listTag, filePath, fileName) {
    let readData = exports.readFileSync(`${filePath}/${fileName}`);
    if (!readData) {
        return readData
    }
    for (let tag of listTag) { 
        readData = readData.replace(tag.regex, tag.value)
    }
    return exports.writeFileSync(`${filePath}/${fileName}`, readData);
};



/**
 * Takes the given directory path and zips it up and stores it
 *   in the given file path
 * 
 * @param {String} directoryPath - The full path to the direcotry on disk to zip up
 * @param {String} filePath - The full path to the file on disk to write the zip to
 */
exports.zipDirectoryToFile = function (directoryPath, filePath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(directoryPath)) {
            throw new Error(`Directory path to be zipped does not exist: ${directoryPath}`);
        }

        let archive = archiver.create('zip', {});
        let output = fs.createWriteStream(filePath);
        archive.pipe(output);
        archive.directory(directoryPath, '') //The 2nd param makes all the files just be included at the root with no directory
        archive.finalize();
        output.on('close', function () {
            resolve();
        });
        output.on('error', function (err) {
            reject(err);
        });
    });
}


/**
 * Reads all the service deployer modules out of the 'services' directory
 * 
 * @returns {Object} - An object of service deployer objects with the service name as keys
 */
exports.getServiceDeployers = function () {
    let deployers = {};

    let servicesPath = path.join(__dirname, '../services')
    let serviceTypes = fs.readdirSync(servicesPath);
    serviceTypes.forEach(serviceType => {
        let servicePath = `${servicesPath}/${serviceType}`;
        if (fs.lstatSync(servicePath).isDirectory()) {
            deployers[serviceType] = require(servicePath);
        }
    });

    return deployers;
}

/**
 * Given two service names, one binding to another, return a string representing the bind.
 * 
 * @param {String} bindServiceName - The service name of the service doing the bind
 * @param {String} dependentServiceName - The service name of the service that depends on the binding service
 */
exports.getBindContextName = function (bindServiceName, dependentServiceName) {
    return `${dependentServiceName}->${bindServiceName}`;
}

/**
 * Given two service names, one consuming events from another, return a string representing the consumption.
 * 
 * @param {String} consumerServiceName - The service name of the service consuming events from the producer
 * @param {String} producerServiceName - The service name of the service that is producing events
 */
exports.getConsumeEventsContextName = function (consumerServiceName, producerServiceName) {
    return `${consumerServiceName}->${producerServiceName}`;
}

/**
 * Given two service names, one producing events for another, return a string representing the production.
 * 
 * @param {String} producerServiceName - The service name of the service producing events
 * @param {String} consumerServiceName - The service name of the service that is consuming events from the producer
 */
exports.getProduceEventsContextName = function (producerServiceName, consumerServiceName) {
    return `${producerServiceName}->${consumerServiceName}`;
}

/**
 * Given a Handel file object, returns the parser object for that Handel file version
 */
exports.getHandelFileParser = function (handelFile) {
    let handelFileVersion = handelFile.version;
    let handelFileParserFilename = `../handelfile/parser-v${handelFileVersion}.js`;
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
exports.createEnvironmentContext = function (handelFile, handelFileParser, environmentName, accountConfig) {
    try {
        return handelFileParser.createEnvironmentContext(handelFile, environmentName, accountConfig);
    }
    catch (err) {
        winston.error(`Error while parsing deploy spec: ${err.message}`);
        return null;
    }
}


exports.configureAwsSdk = function (accountConfig) {
    AWS.config.update({
        region: accountConfig.region,
        maxRetries: 10
    });
}

/**
 * This nice function came from https://stackoverflow.com/questions/11293857/fastest-way-to-copy-file-in-node-js
 */
exports.copyFile = function (source, target) {
    return new Promise(function (resolve, reject) {
        var rd = fs.createReadStream(source);
        rd.on('error', rejectCleanup);
        var wr = fs.createWriteStream(target);
        wr.on('error', rejectCleanup);
        function rejectCleanup(err) {
            rd.destroy();
            wr.end();
            reject(err);
        }
        wr.on('finish', resolve);
        rd.pipe(wr);
    });
}


exports.copyDirectory = function (sourceDir, targetDir) {
    return new Promise((resolve, reject) => {
        ncp(sourceDir, targetDir, function (err) {
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
exports.deleteFolderRecursive = function (path) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach(function (file, index) {
            var curPath = path + "/" + file;
            if (fs.lstatSync(curPath).isDirectory()) { // recurse
                exports.deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
};

/**
 * Turns a string into a valid CloudFormation Logical ID
 * @param id
 * @returns {string}
 */
exports.normalizeLogicalId = function(id) {
    return pascalCase(id, null, true);
};
