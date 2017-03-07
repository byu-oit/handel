const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const archiver = require('archiver');
const winston = require('winston');

/**
 * Reads the contents of a YAML file in a synchronous manner. Don't
 * use this if you want to load the file with async io!
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
 * Reads the contents of a YAML file in an async manner
 */
exports.readYamlFileAsync = function(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, fileData) => {
            if(!err) {
                try {
                    let yaml = yaml.safeLoad(fileData);
                    resolve(yaml);
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
 */
exports.zipDirectoryToFile = function(directoryPath, filePath) {
    if(!fs.existsSync(directoryPath)) {
        throw new Error(`Directory path to be zipped does not exist: ${directoryPath}`);
    }

    //TODO - REMOVE LATER

    let archive = archiver.create('zip', {});
    let output = fs.createWriteStream(filePath);
    archive.pipe(output);
    archive
        .directory(directoryPath)
        .finalize();
}

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

exports.getBindContextName = function(bindServiceName, dependentServiceName) {
    return `${dependentServiceName}->${bindServiceName}`;
}