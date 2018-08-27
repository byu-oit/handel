const fs = require('fs-extra');

function copyNonTsFiles() {
    console.log("Copying Non-TS files");
    const filterFunc = (src, dest) => {
        if(fs.lstatSync(src).isDirectory()) {
            return true;
        }
        if(!src.endsWith('.ts')) {
            return true;
        }
        return false;
    }
    fs.copySync('src', 'dist', { filter: filterFunc })
    console.log("Finished copy");
}

function clean() {
    console.log("Cleaning");
    fs.removeSync('./dist/')
    console.log("Finished clean");
}


//---------------------------------
// Main Script
//---------------------------------
const command = process.argv[2];
switch(command) {
    case "copyNonTsFiles":
        copyNonTsFiles();
        break;
    case "clean":
        clean();
        break;
    default:
        throw new Error('Unsupported NPM script command');
}

