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
    if (input) { //Not all targets will want to override input, but some like scheduled Lambda will.
        putParams.Targets[0].Input = input;
    }
    winston.debug(`Adding target '${targetArn}' to rule '${ruleName}'`)
    return cloudWatchEvents.putTargets(putParams).promise()
        .then(putResponse => {
            winston.debug(`Added target '${targetArn}' to rule '${ruleName}'`);
            return targetId;
        });
}

exports.getTargets = function (ruleName) {
    const cloudWatchEvents = new AWS.CloudWatchEvents({ apiVersion: '2015-10-07' });
    let listParams = {
        Rule: ruleName
    };
    return cloudWatchEvents.listTargetsByRule(listParams).promise()
        .then(listResponse => {
            return listResponse.Targets;
        });
}

exports.getRule = function (ruleName) {
    const cloudWatchEvents = new AWS.CloudWatchEvents({ apiVersion: '2015-10-07' });
    let listParams = {
        NamePrefix: ruleName
    };
    return cloudWatchEvents.listRules(listParams).promise()
        .then(listResponse => {
            for(let rule of listResponse.Rules) {
                if(rule.Name === ruleName) {
                    return rule;
                }
            }
            return null;
        });
}

exports.removeTargets = function (ruleName, targets) {
    const cloudWatchEvents = new AWS.CloudWatchEvents({ apiVersion: '2015-10-07' });

    let targetIds = [];
    for (let target of targets) {
        targetIds.push(target.Id);
    }

    let deleteParams = {
        Ids: targetIds,
        Rule: ruleName
    };
    return cloudWatchEvents.removeTargets(deleteParams).promise()
        .then(removeResponse => {
            if (removeResponse.FailedEntryCount > 0) {
                return false;
            }
            else {
                return true;
            }
        });
}


exports.removeAllTargets = function (ruleName) {
    return exports.getTargets(ruleName)
        .then(targets => {
            if (targets.length > 0) {
                return exports.removeTargets(ruleName, targets)
            }
            else {
                return true;
            }
        });
}