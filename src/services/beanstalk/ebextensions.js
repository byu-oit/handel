const fs = require('fs');

function createEbExtensionsDirIfNotExists(ebextensionsDir) {
    if (!fs.existsSync(ebextensionsDir)) {
        fs.mkdirSync(ebextensionsDir);
    }
}

function deleteEbextensionsDirIfEmpty(ebextensionsDir) {
    let filenames = fs.readdirSync(ebextensionsDir);
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
exports.addEbextensionsToDir = function (ebextensions, artifactDir) {
    let ebextensionsPath = `${artifactDir}/.ebextensions`;
    createEbExtensionsDirIfNotExists(ebextensionsPath);
    for (let ebextensionFileName in ebextensions) {
        let ebextensionContent = ebextensions[ebextensionFileName];
        let ebextensionPath = `${ebextensionsPath}/${ebextensionFileName}`;
        fs.writeFileSync(ebextensionPath, ebextensionContent);
    }
    return true;
}

exports.deleteAddedEbExtensionsFromDirectory = function (ebextensions, artifactDir) {
    let ebextensionsPath = `${artifactDir}/.ebextensions`;
    for (let ebextensionFileName in ebextensions) {
        let ebextensionPath = `${ebextensionsPath}/${ebextensionFileName}`;
        fs.unlinkSync(ebextensionPath);
    }
    deleteEbextensionsDirIfEmpty(ebextensionsPath);
    return true;
}