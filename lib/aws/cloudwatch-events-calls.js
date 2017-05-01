const AWS = require('aws-sdk');
const winston = require('winston');

/**
 * This function doesn't support the following target types yet:
 * * ECS
 * * Kinesis
 * * EC2 Run Command
 * 
 * It also doesn't support the InputPath or InputTransformer yet
 */
exports.addTarget = function (ruleName, targetArn, targetId, input) {
    const cloudWatchEvents = new AWS.CloudWatchEvents({ apiVersion: '2015-10-07' });

    let putParams = {
        Rule: ruleName,
        Targets: [
            {
                Arn: targetArn,
                Id: targetId
            }
        ]
    };
    if(input) { //Not all targets will want to override input, but some like scheduled Lambda will.
        putParams.Targets[0].Input = input;
    }
    winston.debug(`Adding target '${targetArn}' to rule '${ruleName}'`)
    return cloudWatchEvents.putTargets(putParams).promise()
        .then(putResponse => {
            winston.debug(`Added target '${targetArn}' to rule '${ruleName}'`);
            return targetId;
        });
}