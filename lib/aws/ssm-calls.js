const AWS = require('aws-sdk');

exports.storeParameter = function (paramName, paramType, paramValue) {
    const ssm = new AWS.SSM();
    var params = {
        Name: paramName,
        Type: paramType,
        Value: paramValue,
        Description: 'Handel-injected parameter',
        Overwrite: true
    };
    return ssm.putParameter(params).promise();
}

/**
 * Given a list of parameter names, deletes those parameters
 * 
 * @param {List.<String>} parameterNames - The list of parameter names to delete
 * @returns {Promise.<Boolean>} - A Promise that returns true when the params are deleted
 */
exports.deleteParameters = function (parameterNames) {
    const ssm = new AWS.SSM();
    let deletePromises = [];

    for (let parameterName of parameterNames) {
        let deleteParams = {
            Name: parameterName
        };
        deletePromises.push(ssm.deleteParameter(deleteParams).promise());
    }

    return Promise.all(deletePromises)
        .then(() => {
            return true;
        })
}