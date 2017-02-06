var yaml = require('js-yaml');
var dynamodb = require('./services/dynamodb');

function getAccountConfig() {

}

function getDeploySpec() {

}

function doDeploy() {

}

exports.deploy = function(accountConfigFileName, deploySpecFileName) {
    console.log("Deploying!");
    console.log(accountConfigFileName);
    console.log(deploySpecFileName);
}