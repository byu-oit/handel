
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

export async function setNewDesiredAndMaxValues(autoScalingGroupName: string, desiredCount: number, maxCount: number): Promise<void> {
    const updateParams: AWS.AutoScaling.UpdateAutoScalingGroupType = {
        AutoScalingGroupName: autoScalingGroupName,
        DesiredCapacity: desiredCount,
        MaxSize: maxCount
    };
    await awsWrapper.autoScaling.updateAutoScalingGroup(updateParams);
}

async function sleepAwait(ms: number) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    });
}

export async function waitForAllInstancesToBeReady(autoScalinGroupName: string, desiredCount: number, postWaitSleepTime: number): Promise<void> {
    for (;;) {
        winston.verbose('Checking auto scaling group to see if done rolling');
        const currentGroupState = await getAutoScalingGroup(autoScalinGroupName);
        if(!currentGroupState) {
            throw new Error('Could not find needed auto scaling group!');
        }

        // Wait until desiredCount = autoscaling group count, and all instances are in ready state
        if(currentGroupState.Instances && currentGroupState.Instances.length === desiredCount) {
            winston.verbose('Number of instances equals desired count');
            const nonReadyInstances = currentGroupState.Instances.filter(instance => instance.LifecycleState !== 'InService');
            if(nonReadyInstances.length === 0) {
                winston.verbose(`All instances are ready, waiting ${postWaitSleepTime / 1000} more seconds to accomodate any draining in ALBs`);
                await sleepAwait(postWaitSleepTime); // This extra wait can be used to wait for things like ALB draining
                break;
            }
        }

        await sleepAwait(10000); // Check every 5 seconds
    }
}

export async function getAutoScalingGroup(autoScalingGroupName: string): Promise<AWS.AutoScaling.AutoScalingGroup | null> {
    const describeParams: AWS.AutoScaling.Types.AutoScalingGroupNamesType = {
        AutoScalingGroupNames: [autoScalingGroupName]
    };
    const describeResponse = await awsWrapper.autoScaling.describeAutoScalingGroups(describeParams);
    if (describeResponse.AutoScalingGroups.length > 0) {
        return describeResponse.AutoScalingGroups[0];
    }
    else {
        return null;
    }
}

export async function getLaunchConfiguration(launchConfigName: string): Promise<AWS.AutoScaling.LaunchConfiguration | null> {
    const describeParams = {
        LaunchConfigurationNames: [
            launchConfigName
        ]
    };
    const describeResponse = await awsWrapper.autoScaling.describeLaunchConfigurations(describeParams);
    if (describeResponse.LaunchConfigurations && describeResponse.LaunchConfigurations[0]) {
        return describeResponse.LaunchConfigurations[0];
    }
    else {
        return null;
    }
}

export async function cycleInstances(instancesToCycle: AWS.ECS.ContainerInstance[]): Promise<AWS.AutoScaling.ActivityType[] | null> {
    const recycleWk = async (result: AWS.AutoScaling.ActivityType[], instancesToCycle: AWS.ECS.ContainerInstance[]): Promise<AWS.AutoScaling.ActivityType[] | null> => {
        if (instancesToCycle.length < 1) { return result; }
        const obj = instancesToCycle.shift()!;

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
