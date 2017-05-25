const fs = require('fs');

function createEbExtensionsDirIfNotExists(ebextensionsDir) {
    if (!fs.existsSync(ebextensionsDir)) {
        fs.mkdirSync(ebextensionsDir);
    }
}

function addEbextensionToDir(ebextensions, artifactDir) {
    let ebextensionsPath = `${artifactDir}/.ebextensions`;
    createEbExtensionsDirIfNotExists(ebextensionsPath);
    for (let ebextensionFileName in ebextensions) {
        let ebextensionContent = ebextensions[ebextensionFileName];
        let ebextensionPath = `${ebextensionsPath}/${ebextensionFileName}`;
        fs.writeFileSync(ebextensionPath, ebextensionContent);
    }
}

function deleteEbextensionsDirIfEmpty(ebextensionsDir) {
    let filenames = fs.readdirSync(ebextensionsDir);
    if(filenames.length === 0) {
        fs.rmdirSync(ebextensionsDir);
    }
}

function deleteEbextensionsFromDir(ebextensions, artifactDir) {
    let ebextensionsPath = `${artifactDir}/.ebextensions`;
    for (let ebextensionFileName in ebextensions) {
        let ebextensionPath = `${ebextensionsPath}/${ebextensionFileName}`;
        fs.unlinkSync(ebextensionPath);
    }
    deleteEbextensionsDirIfEmpty(ebextensionsPath);
}

// function addEbextensionToWar(ebextensions, warPath) {
//     return new Promise((resolve, reject) => {
//         let input = fs.createReadStream(archivePath);
//     });
// }

/**
 * Given a list of ebextensions, adds them to the given archive
 * 
 * @param {Object} ebextensions - The list of ebextensions files as strings
 * @param {String} archivePath - The path to the archive file to add them to.
 */
exports.addEbextensionsToSourceFile = function (ebextensions, pathToArtifact) {
    return new Promise((resolve, reject) => {
        // let lowerArchivePath = pathToArtifact.toLowerCase();

        let fileStats = fs.lstatSync(pathToArtifact);
        if (fileStats.isDirectory()) { //Will be zipped up
            addEbextensionToDir(ebextensions, pathToArtifact);
            resolve(true);
        }
        // else if (lowerArchivePath.endsWith('.war') || lowerArchivePath.endsWith('.jar')) {
        //     //Unzip war or jar, add file, then re-zip into war
        // }
        else {
            //Return error
            reject(new Error(`Unsupported file type to add ebextensions to: ${pathToArtifact}`));
        }
    });
}

exports.deleteAddedEbExtensionsFromDirectory = function (ebextensions, pathToArtifact) {
    return new Promise((resolve, reject) => {
        // let lowerArchivePath = pathToArtifact.toLowerCase();

        let fileStats = fs.lstatSync(pathToArtifact);
        if (fileStats.isDirectory()) { //Delete ebextensions from dir
            deleteEbextensionsFromDir(ebextensions, pathToArtifact);
            resolve(true);
        }
        // else if (lowerArchivePath.endsWith('.war') || lowerArchivePath.endsWith('.jar')) {
        //     //Unzip war or jar, add file, then re-zip into war
        // }
        else {
            //Return error
            reject(new Error(`Unsupported file type to add ebextensions to: ${pathToArtifact}`));
        }
    });
}