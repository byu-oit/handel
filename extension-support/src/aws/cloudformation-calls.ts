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
import { Tags } from 'handel-extension-api';
import { toAWSTagStyle } from './aws-tags';
import awsWrapper from './aws-wrapper';

async function getErrorsForFailedStack(stackId: string): Promise<string[]> {
    const describeParams: AWS.CloudFormation.DescribeStackEventsInput = {
        StackName: stackId
    };
    const describeResponse = await awsWrapper.cloudFormation.describeStackEvents(describeParams);
    const stackEvents = describeResponse.StackEvents;
    const failEvents = [];
    for (const stackEvent of stackEvents!) {
        const resStatus = stackEvent.ResourceStatus;
        if (resStatus!.includes('FAILED') && (stackEvent.ResourceStatusReason !== 'Resource creation cancelled' && stackEvent.ResourceStatusReason !== 'Resource update cancelled')) {
            failEvents.push(`${resStatus} : ${stackEvent.ResourceType} : ${stackEvent.ResourceStatusReason}`);
        }
        else if (stackEvent.ResourceType === 'AWS::CloudFormation::Stack' &&
            (resStatus === 'CREATE_COMPLETE' || resStatus === 'UPDATE_COMPLETE')) {
            break;
        }
    }
    return failEvents;
}

function getCfErrorMessage(stackName: string, errors: string[]) {
    return `Errors while creating stack '${stackName}': \n${errors.join('\n')}`;
}

/**
 * Given a stack name, returns the stack, or null if it doesnt exist
 */
export async function getStack(stackName: string): Promise<AWS.CloudFormation.Stack | null> {
    const params = {
        StackName: stackName
    };
    try {
        const describeResult = await awsWrapper.cloudFormation.describeStacks(params);
        return describeResult.Stacks![0];
    }
    catch (err) {
        if (err.code === 'ValidationError') { // Stack does not exist
            return null;
        }
        throw err;
    }
}

/**
 * Waits for the given stack to be in the given state
 */
export async function waitForStack(stackName: string, stackState: string): Promise<AWS.CloudFormation.Stack> {
    const waitParams: AWS.CloudFormation.DescribeStacksInput = {
        StackName: stackName
    };
    const waitResponse = await awsWrapper.cloudFormation.waitFor(stackState, waitParams);
    return waitResponse.Stacks![0];
}

/**
 * Given a stack name with template and parameters, creates the stack
 *
 * This method will wait for the stack to be in a create complete state
 * before resolving the promise
 */
export async function createStack(stackName: string, templateBodyOrUrl: string, parameters: AWS.CloudFormation.Parameters, timeoutInMinutes: number, tags?: Tags | null): Promise<AWS.CloudFormation.Stack> {
    const params: AWS.CloudFormation.CreateStackInput = {
        StackName: stackName,
        OnFailure: 'DELETE',
        Parameters: parameters,
        Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
        TimeoutInMinutes: timeoutInMinutes
    };
    if (templateBodyOrUrl.startsWith('s3://') || templateBodyOrUrl.startsWith('https://')) {
        params.TemplateURL = templateBodyOrUrl;
    } else {
        params.TemplateBody = templateBodyOrUrl;
    }

    // Add tags to the stack if provided
    if (tags) {
        params.Tags = toAWSTagStyle(tags);
    }

    const createResult = await awsWrapper.cloudFormation.createStack(params);
    const stackId = createResult.StackId;
    try {
        const createdStack = await waitForStack(stackName, 'stackCreateComplete');
        return createdStack;
    }
    catch (err) {
        const errors = await getErrorsForFailedStack(stackId!);
        throw new Error(getCfErrorMessage(stackName, errors));
    }
}

/**
 * Given a stack name with template and parameters, updates the existing stack
 *
 * This method will wait for the stack to be in an update complete state
 * before resolving the promise.
 */
export async function updateStack(stackName: string, templateBodyOrUrl: string, parameters: AWS.CloudFormation.Parameters, tags?: Tags | null) {
    const params: AWS.CloudFormation.UpdateStackInput = {
        StackName: stackName,
        Parameters: parameters,
        Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
    };
    if (templateBodyOrUrl.startsWith('s3://') || templateBodyOrUrl.startsWith('https://')) {
        params.TemplateURL = templateBodyOrUrl;
    } else {
        params.TemplateBody = templateBodyOrUrl;
    }

    // Add tags to the stack if provided
    if (tags) {
        params.Tags = toAWSTagStyle(tags);
    }

    try {
        const createResult = await awsWrapper.cloudFormation.updateStack(params);
        const stackId = createResult.StackId;
        try {
            const updatedStack = await waitForStack(stackName, 'stackUpdateComplete');
            return updatedStack;
        }
        catch (err) {
            const errors = await getErrorsForFailedStack(stackId!);
            if (errors.length === 0) {
                throw new Error('Error while waiting for stackUpdateComplete state on stack ' + stackName + ':\n ' + JSON.stringify(err));
            }
            throw new Error(getCfErrorMessage(stackName, errors));
        }
    }
    catch (err) {
        if (err.message.includes('No updates are to be performed')) {
            return exports.getStack(stackName);
        }
        throw err;
    }
}

/**
 * Given a stack name, deletes the existing stack
 *
 * This method will wait for the stack to be in the delete complete state
 * before resolving the promise
 */
export async function deleteStack(stackName: string): Promise<boolean> {
    const deleteParams: AWS.CloudFormation.DeleteStackInput = {
        StackName: stackName
    };
    const deleteResult = await awsWrapper.cloudFormation.deleteStack(deleteParams);
    const waitParams: AWS.CloudFormation.DescribeStacksInput = {
        StackName: stackName
    };
    const waitResponse = await awsWrapper.cloudFormation.waitFor('stackDeleteComplete', waitParams);
    return true;
}

/**
 * Given a regular JavaScript object of key/value pairs, returns the corresponding
 * CloudFormation parameters representation.
 *
 * Example:
 * The object {
 *   myparam: 'myvalue'
 * }
 *
 * ...becomes the object {
 *   ParameterKey: 'myparam',
 *   ParameterValue: 'myvalue',
 *   UsePreviousValue: false
 * }
 *
 * @param {Object} parametersObj - The object with plain key/value pairs to be changed into CF-style parameters
 * @returns {Object} - The object contianing CloudFormation-style parameters
 */
export function getCfStyleStackParameters(parametersObj: any): AWS.CloudFormation.Parameters {
    const stackParameters: AWS.CloudFormation.Parameters = [];

    for (const key in parametersObj) {
        if (parametersObj.hasOwnProperty(key)) {
            stackParameters.push({
                ParameterKey: key,
                ParameterValue: parametersObj[key],
                UsePreviousValue: false
            });
        }
    }

    return stackParameters;
}

/**
 * Given a CloudFormation stack, get the output for the given key
 *
 * @param {string} outputKey - The name of the output value to get
 * @param {Object} cfStack - The CF stack object returned from the CloudFormation API
 * @returns {string} - Returns either the output if it is present, or null if it isn't
 */
export function getOutput(outputKey: string, cfStack: AWS.CloudFormation.Stack): string | null {
    for (const output of cfStack.Outputs!) {
        if (output.OutputKey === outputKey) {
            return output.OutputValue!;
        }
    }
    return null;
}
