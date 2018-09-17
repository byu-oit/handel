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
import { AccountConfig, ServiceContext } from 'handel-extension-api';
import { awsCalls, deployPhase, handlebars  } from 'handel-extension-support';
import * as winston from 'winston';
import { getMemoryForInstance } from '../../aws/pricing-calls';
import { HandlebarsEcsTemplateAutoScaling, HandlebarsEcsTemplateContainer } from '../../common/ecs-shared-config-types';
import {EcsServiceConfig} from './config-types';

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
export async function createAutoScalingLambdaIfNotExists(accountConfig: AccountConfig): Promise<AWS.CloudFormation.Stack> {
    const stackName = 'HandelEcsAutoScalingLambda';
    const stack = await awsCalls.cloudFormation.getStack(stackName);
    if (!stack) {
        const s3ObjectInfo = await deployPhase.uploadDirectoryToHandelBucket(`${__dirname}/cluster-scaling-lambda/`, 'handel/ecs-cluster-auto-scaling-lambda', 'lambda-code', accountConfig);
        const handlebarsParams = {
            s3Bucket: s3ObjectInfo.Bucket,
            s3Key: s3ObjectInfo.Key
        };
        const compiledTemplate = await handlebars.compileTemplate(`${__dirname}/cluster-scaling-lambda/scaling-lambda-template.yml`, handlebarsParams);
        winston.info(`Creating Lambda for ECS auto-scaling`);
        return awsCalls.cloudFormation.createStack(stackName, compiledTemplate, [], 30, accountConfig.handel_resource_tags);
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
export async function createDrainingLambdaIfNotExists(accountConfig: AccountConfig): Promise<AWS.CloudFormation.Stack> {
    const stackName = 'HandelEcsDrainingLambda';
    const stack = await awsCalls.cloudFormation.getStack(stackName);
    if (!stack) {
        // Stack doesn't exist, create it
        const s3ObjectInfo = await deployPhase.uploadDirectoryToHandelBucket(`${__dirname}/cluster-draining-lambda/`, 'handel/ecs-cluster-draining-lambda', 'lambda-code', accountConfig);
        const handlebarsParams = {
            s3Bucket: s3ObjectInfo.Bucket,
            s3Key: s3ObjectInfo.Key
        };

        const compiledTemplate = await handlebars.compileTemplate(`${__dirname}/cluster-draining-lambda/cluster-draining-template.yml`, handlebarsParams);
        winston.info(`Creating Lambda for ECS draining`);
        return awsCalls.cloudFormation.createStack(stackName, compiledTemplate, [], 30, accountConfig.handel_resource_tags);
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
export async function getMemoryForInstanceType(ownServiceContext: ServiceContext<EcsServiceConfig>): Promise<number> {
    const serviceParams = ownServiceContext.params;
    let instanceType = 't2.micro';
    if (serviceParams.cluster && serviceParams.cluster.instance_type) {
        instanceType = serviceParams.cluster.instance_type;
    }
    const instanceMemory = await getMemoryForInstance(instanceType, ownServiceContext.accountConfig.region);
    return instanceMemory;
}

export async function getInstanceCountForCluster(instanceMemory: number, autoScaling: HandlebarsEcsTemplateAutoScaling, containerConfigs: HandlebarsEcsTemplateContainer[], calculationType: string, serviceName: string): Promise<number> {
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
