const winston = require('winston');
const AWS = require('aws-sdk');
const ecs = new AWS.ECS({
    apiVersion: '2014-11-13'
});

exports.registerTaskDefinition = function(taskDefinition) {
    return ecs.registerTaskDefinition(taskDefinition).promise()
        .then(registerResponse => {
            return registerResponse.taskDefinition;
        });
}

exports.createService = function() {
    return null;
}

exports.updateService = function() {
    return null;
}