const fs = require('fs');
const yaml = require('js-yaml');
const admZip = require('adm-zip');
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