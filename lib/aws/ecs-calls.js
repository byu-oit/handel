const winston = require('winston');
const AWS = require('aws-sdk');
const ecs = new AWS.ECS({
    apiVersion: '2014-11-13'
});

exports.getCluster = function(clusterName) {
    var describeParams = {
        clusters: [clusterName]
    };
    return ecs.describeClusters(describeParams).promise()
        .then(describeResponse => {
            if(describeResponse.clusters.length > 0) {
                return describeResponse.clusters[0];
            }
            else {
                return null;
            }
        });
}

exports.createCluster = function(clusterName) {
    var createParams = {
        clusterName: clusterName
    };
    return ecs.createCluster(createParams).promise();
}

