const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const archiver = require('archiver');
const winston = require('winston');

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


// /**
//  * Takes the given directory path and zips it up and stores it
//  *   in the given file path
//  * 
//  * @param {String} directoryPath - The full path to the direcotry on disk to zip up
//  * @param {String} filePath - The full path to the file on disk to write the zip to
//  */
// exports.zipDirectoryToFile = function(directoryPath, filePath) {
//     if(!fs.existsSync(directoryPath)) {
//         throw new Error(`Directory path to be zipped does not exist: ${directoryPath}`);
//     }

//     let archive = archiver.create('zip', {});
//     let output = fs.createWriteStream(filePath);
//     archive.pipe(output);
//     archive
//         .directory(directoryPath)
//         .finalize();
// }


/**
 * Reads all the service deployer modules out of the 'services' directory
 * 
 * @returns {Object} - An object of service deployer objects with the service name as keys
 */
exports.getServiceDeployers = function() {
    let deployers = {};
    
    let servicesPath = path.join(__dirname, '../services')
    let serviceNames = fs.readdirSync(servicesPath);
    serviceNames.forEach(serviceName => {
        let servicePath = `${servicesPath}/${serviceName}`;
        if(fs.lstatSync(servicePath).isDirectory()) { //Zip directory up into file 
            deployers[serviceName] = require(servicePath);
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
 * Given a ServiceContext, return the prefix used for environment variables naming
 * 
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to get the prefix for
 * @returns {String} - The environment variable prefix string constructed from the service context
 */
exports.getEnvVarKeyPrefix = function(serviceContext) {
    return `${serviceContext.serviceType}_${serviceContext.appName}_${serviceContext.environmentName}_${serviceContext.serviceName}`.toUpperCase();
}