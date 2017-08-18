/*
 * Copyright 2017 Brigham Young University
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
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
    winston.verbose(`Adding target '${targetArn}' to rule '${ruleName}'`)
    return cloudWatchEvents.putTargets(putParams).promise()
        .then(putResponse => {
            winston.verbose(`Added target '${targetArn}' to rule '${ruleName}'`);
            return targetId;
        });
}

/**
 * Given the name of a CloudWatch Events rule, returns the targets that
 * are defined in that rule.
 */
exports.getTargets = function (ruleName) {
    const cloudWatchEvents = new AWS.CloudWatchEvents({ apiVersion: '2015-10-07' });
    let listParams = {
        Rule: ruleName
    };
    winston.verbose(`Getting targets for rule '${ruleName}'`);
    return cloudWatchEvents.listTargetsByRule(listParams).promise()
        .then(listResponse => {
            winston.verbose(`Finished getting targets for rule '${ruleName}'`)
            return listResponse.Targets;
        });
}

/**
 * Given a rule name, returns that rule from CloudWatch Events, or null if it doesn't exist
 */
exports.getRule = function (ruleName) {
    const cloudWatchEvents = new AWS.CloudWatchEvents({ apiVersion: '2015-10-07' });
    let listParams = {
        NamePrefix: ruleName
    };
    winston.verbose(`Looking for rule '${ruleName}'`)
    return cloudWatchEvents.listRules(listParams).promise()
        .then(listResponse => {
            for (let rule of listResponse.Rules) {
                if (rule.Name === ruleName) {
                    winston.verbose(`Found rule '${ruleName}'`);
                    return rule;
                }
            }
            winston.verbose(`Rule '${ruleName}' doesn't exist`);
            return null;
        });
}

/**
 * Given a rule name and list of target IDs, removes the targets from the rule
 */
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
    winston.verbose(`Removing targets from '${ruleName}'`);
    return cloudWatchEvents.removeTargets(deleteParams).promise()
        .then(removeResponse => {
            if (removeResponse.FailedEntryCount > 0) {
                winston.verbose(`Finished removing targets from '${ruleName}'`);
                return false;
            }
            else {
                winston.verbose(`One or more targets was not successfully removed from '${ruleName}'`);
                return true;
            }
        });
}


/**
 * Removes all targets from the given event rule
 */
exports.removeAllTargets = function (ruleName) {
    winston.info(`Removing all targets from '${ruleName}'`);
    return exports.getTargets(ruleName)
        .then(targets => {
            if (targets.length > 0) {
                return exports.removeTargets(ruleName, targets)
                    .then(result => {
                        winston.verbose(`Finished removing all targets from '${ruleName}'`);
                        return result;
                    });
            }
            else {
                return true;
            }
        });
}