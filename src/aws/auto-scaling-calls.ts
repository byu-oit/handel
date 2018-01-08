
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

import * as AWS from 'aws-sdk';
import * as winston from 'winston';
import awsWrapper from './aws-wrapper';

function delay(millis: number) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve();
        }, millis);
    });
}

export async function cycleInstances(instancesToCycle: any): Promise<AWS.AutoScaling.ActivityType[] | null> {
    const recycleWk = async (result: AWS.AutoScaling.ActivityType[], instancesToCycle: any): Promise<AWS.AutoScaling.ActivityType[] | null> => {
        if (instancesToCycle.length < 1) { return result; }
        const obj = instancesToCycle.shift();

        winston.debug(`recycle:\n${JSON.stringify(obj, null, 2)}`);

        try {
            const terminateInstanceParams = {
                InstanceId: obj.ec2InstanceId,
                ShouldDecrementDesiredCapacity: false
            };
            const activityType = await awsWrapper.autoScaling.terminateInstanceInAutoScalingGroup(terminateInstanceParams);
            result.push(activityType);
            if (instancesToCycle.length > 0) {
                await delay(60000);
                return recycleWk(result, instancesToCycle);
            }
            return result;
        }
        catch (err) {
            if (err.statusCode == 400 && err.message.match(/Instance Id not found/)) {
                result.push(err);
                return recycleWk(result, instancesToCycle);
            }
            winston.error(`Error:\n${JSON.stringify(err, null, 2)}\n${err.stack}`);
            return null;
        }
    };

    return recycleWk([], instancesToCycle);
}

export async function describeLaunchConfigurationsByInstanceIds(instanceIds: string[]) {
    try {
        const describeAsgInstancesParams = {
            InstanceIds: instanceIds
        };
        const describeResult = await awsWrapper.autoScaling.describeAutoScalingInstances(describeAsgInstancesParams);
        const launchConfigurations: any = {}; // TODO - Make this a better type later
        for (const asgInstance of describeResult.AutoScalingInstances!) {
            if (asgInstance.LaunchConfigurationName) {
                launchConfigurations[asgInstance.LaunchConfigurationName] = true;
            }
        }
        const launchConfigurationNames = [];
        for (const launchConfigurationName in launchConfigurations) {
            if (launchConfigurations.hasOwnProperty(launchConfigurationName)) {
                launchConfigurationNames.push(launchConfigurationName);
            }
        }
        if (launchConfigurationNames.length < 1) {
            return {
                LaunchConfigurations: []
            };
        }
        const describeLaunchConfigParams = {
            LaunchConfigurationNames: launchConfigurationNames
        };
        return awsWrapper.autoScaling.describeLaunchConfigurations(describeLaunchConfigParams);
    }
    catch (err) {
        winston.error(`Error:\n${JSON.stringify(err, null, 2)}\n${err.stack}`);
        return null;
    }
}
