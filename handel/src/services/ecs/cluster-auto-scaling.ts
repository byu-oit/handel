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
import { AccountConfig } from 'handel-extension-api';
import * as extensionSupport from 'handel-extension-support';
import * as winston from 'winston';
import { AutoScalingConfig, ContainerConfig, HandlebarsEcsTemplateAutoScaling, HandlebarsEcsTemplateContainer } from '../../common/ecs-shared-config-types';

// Values are specified in MiB
interface Ec2InstanceMemoryMap {
    [key: string]: number;
}

// I have to hard-code these because AWS doesn't seem to provide an API to list instance type attributes like memory size, etc.
const EC2_INSTANCE_MEMORY_MAP: Ec2InstanceMemoryMap = {
    't2.nano': 500,
    't2.micro': 1000,
    't2.small': 2000,
    't2.medium': 4000,
    't2.large': 8000,
    't2.xlarge': 16000,
    't2.2xlarge': 32000,
    'm1.small': 1700,
    'm1.medium': 3750,
    'm1.large': 7500,
    'm1.xlarge': 15000,
    'm2.xlarge': 17100,
    'm2.2xlarge': 34200,
    'm2.4xlarge': 68400,
    'm4.large': 8000,
    'm4.xlarge': 16000,
    'm4.2xlarge': 32000,
    'm4.3xlarge': 64000,
    'm4.10xlarge': 160000,
    'm4.16xlarge': 256000,
    'm3.medium': 3750,
    'm3.large': 7500,
    'm3.xlarge': 15000,
    'm3.2xlarge': 30000,
    'm5.large': 8000,
    'm5.xlarge': 16000,
    'm5.2xlarge': 32000,
    'm5.4xlarge': 64000,
    'm5.12xlarge': 192000,
    'm5.24xlarge': 384000,
    'c1.medium': 1700,
    'c1.xlarge': 7000,
    'c4.large': 3750,
    'c4.xlarge': 7500,
    'c4.2xlarge': 15000,
    'c4.4xlarge': 30000,
    'c4.8xlarge': 60000,
    'c3.large': 3750,
    'c3.xlarge': 7500,
    'c3.2xlarge': 15000,
    'c3.4xlarge': 30000,
    'c3.8xlarge': 60000,
    'r4.large': 15250,
    'r4.xlarge': 30500,
    'r4.2xlarge': 61000,
    'r4.4xlarge': 122000,
    'r4.8xlarge': 240000,
    'r4.16xlarge': 488000,
    'r3.large': 15250,
    'r3.xlarge': 30500,
    'r3.2xlarge': 61000,
    'r3.4xlarge': 122000,
    'r3.8xlarge': 244000,
    'i3.large': 15250,
    'i3.xlarge': 30500,
    'i3.2xlarge': 61000,
    'i3.4xlarge': 122000,
    'i3.8xlarge': 244000,
    'i3.16xlarge': 488000
};

/**
 * This function creates an account-wide Lambda for ECS cluster auto-scaling if it doesn't already exist.
 *
 * This Lambda looks at every cluster in the account and logs two CloudWatch metrics for each every minute:
 * * ClusterNeedsScalingUp
 * * ClusterNeedsScalingDown
 *
 * These metrics are used by Handel ECS clusters to scale up and down the instances.
 *
 * The code for the auto-scaling Lambda can be found in the "cluster-scaling-lambda" directory inside
 * the ECS service deployer directory.
 */
export async function createAutoScalingLambdaIfNotExists(accountConfig: AccountConfig) {
    const stackName = 'HandelEcsAutoScalingLambda';
    const stack = await extensionSupport.awsCalls.cloudFormation.getStack(stackName);
    if (!stack) {
        const s3ObjectInfo = await extensionSupport.deployPhase.uploadDirectoryToHandelBucket(`${__dirname}/cluster-scaling-lambda/`, 'handel/ecs-cluster-auto-scaling-lambda', 'lambda-code', accountConfig);
        const handlebarsParams = {
            s3Bucket: s3ObjectInfo.Bucket,
            s3Key: s3ObjectInfo.Key
        };
        const compiledTemplate = await extensionSupport.handlebars.compileTemplate(`${__dirname}/cluster-scaling-lambda/scaling-lambda-template.yml`, handlebarsParams);
        winston.info(`Creating Lambda for ECS auto-scaling`);
        return extensionSupport.awsCalls.cloudFormation.createStack(stackName, compiledTemplate, [], 30, accountConfig.handel_resource_tags);
    }
    else {
        return stack;
    }
}

/**
 * This function creates an account-wide Lambda for draining terminating ECS cluster instances if it doesn't already exist.
 *
 * The code for the draining Lambda can be found in the "cluster-draining-lambda" directory inside
 * the ECS service deployer directory.
 */
export async function createDrainingLambdaIfNotExists(accountConfig: AccountConfig) {
    const stackName = 'HandelEcsDrainingLambda';
    const stack = await extensionSupport.awsCalls.cloudFormation.getStack(stackName);
    if (!stack) {
        // Stack doesn't exist, create it
        const s3ObjectInfo = await extensionSupport.deployPhase.uploadDirectoryToHandelBucket(`${__dirname}/cluster-draining-lambda/`, 'handel/ecs-cluster-draining-lambda', 'lambda-code', accountConfig);
        const handlebarsParams = {
            s3Bucket: s3ObjectInfo.Bucket,
            s3Key: s3ObjectInfo.Key
        };

        const compiledTemplate = await extensionSupport.handlebars.compileTemplate(`${__dirname}/cluster-draining-lambda/cluster-draining-template.yml`, handlebarsParams);
        winston.info(`Creating Lambda for ECS draining`);
        return extensionSupport.awsCalls.cloudFormation.createStack(stackName, compiledTemplate, [], 30, accountConfig.handel_resource_tags);
    }
    else {
        // Stack already exists
        return stack;
    }
}

/**
 * This function calculates the required instance count for the ECS cluster based on the requested tasks.
 *
 * This function is used for both 'min' and 'max' auto-scaling group calculations.
 */
export function getInstanceCountForCluster(instanceType: string, autoScaling: HandlebarsEcsTemplateAutoScaling, containerConfigs: HandlebarsEcsTemplateContainer[], calculationType: string, serviceName: string): number {
    const instanceMemory = EC2_INSTANCE_MEMORY_MAP[instanceType];
    if (!instanceMemory) {
        throw new Error(`${serviceName} - Unhandled instance type specified: ${instanceType}`);
    }
    const maxInstanceMemoryToUse = instanceMemory * .9; // Fill up instances to 90% of capacity

    // Calculate the total number of tasks to fit
    let tasksCount = null;
    if (calculationType === 'max') { // Calculate max containers
        tasksCount = autoScaling.maxTasks;
    }
    else { // Calculate min containers
        tasksCount = autoScaling.minTasks;
    }

    // Calculate the total size of a single task
    let totalTaskMb = 0;
    for (const containerConfig of containerConfigs) {
        totalTaskMb += containerConfig.maxMb;
    }

    // Calculate the number of instances needed to fit the number of tasks
    let numInstances = 1; // Need at least one instance
    let currentInstanceMem = 0;
    for (let i = 0; i < tasksCount; i++) {
        if ((currentInstanceMem + totalTaskMb) > maxInstanceMemoryToUse) {
            numInstances += 1;
            currentInstanceMem = 0;
        }
        currentInstanceMem += totalTaskMb;
    }

    // When calculating maxInstances, multiple maxContainers by two so that we can temporarily have more instances during deployments if necessary
    if (calculationType === 'max') {
        numInstances *= 2;
    }

    return numInstances;
}
