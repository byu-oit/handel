/*
 * Copyright 2018 Brigham Young University
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
import * as winston from 'winston';
import awsWrapper from './aws-wrapper';

/**
 * This function doesn't support the following target types yet:
 * * ECS
 * * Kinesis
 * * EC2 Run Command
 *
 * It also doesn't support the InputPath or InputTransformer yet
 */
export async function addTarget(ruleName: string, targetArn: string, targetId: string, input: AWS.CloudWatchEvents.TargetInput): Promise<string> {
    const putParams: AWS.CloudWatchEvents.PutTargetsRequest = {
        Rule: ruleName,
        Targets: [
            {
                Arn: targetArn,
                Id: targetId
            }
        ]
    };
    if (input) { // Not all targets will want to override input, but some like scheduled Lambda will.
        putParams.Targets[0].Input = input;
    }
    winston.verbose(`Adding target '${targetArn}' to rule '${ruleName}'`);
    const putRequest = await awsWrapper.cloudWatchEvents.putTargets(putParams);
    winston.verbose(`Added target '${targetArn}' to rule '${ruleName}'`);
    return targetId;
}

/**
 * Given the name of a CloudWatch Events rule, returns the targets that
 * are defined in that rule.
 */
export async function getTargets(ruleName: string): Promise<AWS.CloudWatchEvents.TargetList | null> {
    const listParams = {
        Rule: ruleName
    };
    winston.verbose(`Getting targets for rule '${ruleName}'`);
    const listResponse = await awsWrapper.cloudWatchEvents.listTargetsByRule(listParams);
    winston.verbose(`Finished getting targets for rule '${ruleName}'`);
    if (listResponse.Targets) {
        return listResponse.Targets;
    }
    else {
        return null;
    }
}

/**
 * Given a rule name, returns that rule from CloudWatch Events, or null if it doesn't exist
 */
export async function getRule(ruleName: string): Promise<AWS.CloudWatchEvents.Rule|null> {
    const listParams = {
        NamePrefix: ruleName
    };
    winston.verbose(`Looking for rule '${ruleName}'`);
    const listResponse = await awsWrapper.cloudWatchEvents.listRules(listParams);
    for (const rule of listResponse.Rules!) {
        if (rule.Name === ruleName) {
            winston.verbose(`Found rule '${ruleName}'`);
            return rule;
        }
    }
    winston.verbose(`Rule '${ruleName}' doesn't exist`);
    return null;
}

/**
 * Given a rule name and list of target IDs, removes the targets from the rule
 */
export async function removeTargets(ruleName: string, targets: AWS.CloudWatchEvents.TargetList): Promise<boolean> {
    const targetIds: string[] = [];
    for (const target of targets) {
        targetIds.push(target.Id);
    }

    const deleteParams = {
        Ids: targetIds,
        Rule: ruleName
    };
    winston.verbose(`Removing targets from '${ruleName}'`);
    const removeResponse = await awsWrapper.cloudWatchEvents.removeTargets(deleteParams);
    if (removeResponse.FailedEntryCount && removeResponse.FailedEntryCount > 0) {
        winston.verbose(`One or more targets was not successfully removed from '${ruleName}'`);
        return false;
    }
    else {
        winston.verbose(`Finished removing targets from '${ruleName}'`);
        return true;
    }
}

/**
 * Removes all targets from the given event rule
 */
export async function removeAllTargets(ruleName: string): Promise<boolean> {
    winston.info(`Removing all targets from '${ruleName}'`);
    const targets = await getTargets(ruleName);
    if (targets && targets.length > 0) {
        const removeResult = await removeTargets(ruleName, targets);
        winston.verbose(`Finished removing all targets from '${ruleName}'`);
        return removeResult;
    }
    else {
        return true;
    }
}
