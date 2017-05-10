const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const archiver = require('archiver');
const winston = require('winston');
const ServiceContext = require('../datatypes/service-context');
const request = require('request');

exports.readFileSync = function(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    }
    catch(e) {
        winston.error("Couldn't load file: " + e);
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
exports.readYamlFileSync = function(filePath) {
    try {
        var doc = yaml.safeLoad(fs.readFileSync(filePath, 'utf8'));
        return doc;
    }
    catch(e) {
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
exports.readYamlFileAsync = function(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, fileData) => {
            if(!err) {
                try {
                    resolve(yaml.safeLoad(fileData));
                }
                catch(e) {
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
 * Takes the given directory path and zips it up and stores it
 *   in the given file path
 * 
 * @param {String} directoryPath - The full path to the direcotry on disk to zip up
 * @param {String} filePath - The full path to the file on disk to write the zip to
 */
exports.zipDirectoryToFile = function(directoryPath, filePath) {
    return new Promise((resolve, reject) => {
        if(!fs.existsSync(directoryPath)) {
            throw new Error(`Directory path to be zipped does not exist: ${directoryPath}`);
        }

        let archive = archiver.create('zip', {});
        let output = fs.createWriteStream(filePath);
        archive.pipe(output);
        archive.directory(directoryPath, '') //The 2nd param makes all the files just be included at the root with no directory
        archive.finalize();
        output.on('close', function() {
            resolve();
        });
        output.on('error', function(err) {
            reject(err);
        });
    });
}


/**
 * Reads all the service deployer modules out of the 'services' directory
 * 
 * @returns {Object} - An object of service deployer objects with the service name as keys
 */
exports.getServiceDeployers = function() {
    let deployers = {};
    
    let servicesPath = path.join(__dirname, '../services')
    let serviceTypes = fs.readdirSync(servicesPath);
    serviceTypes.forEach(serviceType => {
        let servicePath = `${servicesPath}/${serviceType}`;
        if(fs.lstatSync(servicePath).isDirectory()) { 
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
exports.getBindContextName = function(bindServiceName, dependentServiceName) {
    return `${dependentServiceName}->${bindServiceName}`;
}

/**
 * Given two service names, one consuming events from another, return a string representing the consumption.
 * 
 * @param {String} consumerServiceName - The service name of the service consuming events from the producer
 * @param {String} producerServiceName - The service name of the service that is producing events
 */
exports.getConsumeEventsContextName = function(consumerServiceName, producerServiceName) {
    return `${consumerServiceName}->${producerServiceName}`;
}

/**
 * Given two service names, one producing events for another, return a string representing the production.
 * 
 * @param {String} producerServiceName - The service name of the service producing events
 * @param {String} consumerServiceName - The service name of the service that is consuming events from the producer
 */
exports.getProduceEventsContextName = function(producerServiceName, consumerServiceName) {
    return `${producerServiceName}->${consumerServiceName}`;
}

/**
 * Given a Handel file object, returns the parser object for that Handel file version
 */
exports.getHandelFileParser = function(handelFile) {
    let handelFileVersion = handelFile.version;
    let handelFileParserFilename = `../handelfile/parser-v${handelFileVersion}.js`;
    let handelFileParser;
    try {
        handelFileParser = require(handelFileParserFilename);
        return handelFileParser;
    }
    catch(versionError) {
        winston.error(`Invalid deploy spec version: ${handelFile.version}`);
        return null;
    }
}

//Adapted from http://stackoverflow.com/questions/2090551/parse-query-string-in-javascript
exports.parseHashValue = function(qstr) {
    let hash = {};
    let a = qstr.split('&');
    for (let i = 0; i < a.length; i++) {
        let b = a[i].split('=');
        hash[decodeURIComponent(b[0])] = decodeURIComponent(b[1] || '');
    }
    return hash;
}

exports.makeHttpRequest = function(url) {
    return new Promise((resolve, reject) => {
        request(url, function (err, response, body) {
            if(!err) {
                if(response.statusCode === 200) {
                    return resolve(body);
                }
                else {
                    return reject(new Error(`Unhandled status code: ${response.statusCode}`));
                }
            }
            else {
                return reject(err);
            }
        });
    });
}

exports.getExternalServiceContext = function(externalServiceDependency, deployVersion) {
    return new Promise((resolve, reject) => {
        let parts = externalServiceDependency.split("#");
        let errorMsg = "Invalid external service reference. Must be of the following format: https://pathtohandelfile.domain#appName=<appName>&environmentName=<environmentName>&serviceName=<serviceName>"
        if(parts.length !== 2) {
            return reject(new Error(errorMsg));
        }
        let handelFileUrl = parts[0];
        let externalServiceInfo = exports.parseHashValue(parts[1]);
        let appName = externalServiceInfo.appName;
        let envName = externalServiceInfo.environmentName;
        let serviceName = externalServiceInfo.serviceName;
        if(!appName || !envName || !serviceName) {
            return reject(new Error(errorMsg));
        }

        exports.makeHttpRequest(handelFileUrl)
            .then(data => {
                let handelFile = yaml.safeLoad(data);
                if(!handelFile.environments[envName] || !handelFile.environments[envName][serviceName]) {
                    return reject(new Error("Invalid external service reference. Make sure you are specifying the correct environment and service name"));
                }
                let serviceDef = handelFile.environments[envName][serviceName];
                let serviceType = serviceDef.type;
                let serviceContext = new ServiceContext(appName, envName, serviceName, serviceType, deployVersion, serviceDef);
                return resolve(serviceContext);
            });
    });
}