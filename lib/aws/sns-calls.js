const AWS = require('aws-sdk');
const winston = require('winston');

exports.subscribeToTopic = function(topicArn, protocol, endpoint) {
    let sns = new AWS.SNS({apiVersion: '2010-03-31'});
    let subscribeParams = {
        Protocol: protocol,
        TopicArn: topicArn,
        Endpoint: endpoint
    };
    winston.debug(`Subscribing ${endpoint} to SNS topic ${topicArn}`);
    return sns.subscribe(subscribeParams).promise()
        .then(subscribeResponse => {
            winston.debug(`Subscribed ${endpoint} to SNS topic ${topicArn}`);
            return subscribeResponse.SubscriptionArn;
        });
}