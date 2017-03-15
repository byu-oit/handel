const winston = require('winston');
const AWS = require('aws-sdk');

exports.registerTaskDefinition = function(taskDefinition) {
    const ecs = new AWS.ECS({
        apiVersion: '2014-11-13'
    });
    return ecs.registerTaskDefinition(taskDefinition).promise()
        .then(registerResponse => {
            return registerResponse.taskDefinition;
        });
}