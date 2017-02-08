const fs = require('fs');
const yaml = require('js-yaml');
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