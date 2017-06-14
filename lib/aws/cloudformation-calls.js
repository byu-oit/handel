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
const winston = require('winston');
const AWS = require('aws-sdk');

function getErrorsForFailedStack(cloudFormation, stackId) {
    var describeParams = {
        StackName: stackId
    };
    return cloudFormation.describeStackEvents(describeParams).promise()
        .then(describeResponse => {
            let stackEvents = describeResponse.StackEvents;
            let failEvents = [];
            for (let stackEvent of stackEvents) {
                if (stackEvent.ResourceStatus.includes("FAILED")) {
                    failEvents.push(stackEvent.ResourceStatusReason);
                }
            }
            return failEvents;
        });
}

function getCfErrorMessage(stackName, errors) {
    return `Errors while creating stack '${stackName}': \n${errors.join('\n')}`
}

function getCfTags(tags) {
    let cfTags = [];
    for (let tagName in tags) {
        cfTags.push({
            Key: tagName,
            Value: tags[tagName]
        });
    }
    return cfTags;
}

/**
 * Given a stack name, returns the stack, or null if it doesnt exist
 * 
 * @param {String} stackName - The name of the stack to get
 * @returns {Promise.<Object>} - The CloudFormation Stack, or null if it doesnt exist
 */
exports.getStack = function (stackName) {
    const cloudformation = new AWS.CloudFormation({
        apiVersion: '2010-05-15'
    });
    var params = {
        StackName: stackName
    };
    winston.debug(`Attempting to get CloudFormation stack ${stackName}`);
    return cloudformation.describeStacks(params).promise()
        .then(describeResult => {
            winston.debug(`Found CloudFormation stack ${stackName}`);
            return describeResult.Stacks[0];
        })
        .catch(err => {
            if (err.code === "ValidationError") { //Stack does not exist
                winston.debug(`CloudFormation stack ${stackName} not found`);
                return null;
            }
            throw err;
        });
}

/**
 * Waits for the given stack to be in the given state
 * 
 * @param {String} stackName - The name of the stack to wait for
 * @param {String} stackState - The state to wait for
 * @returns {Promise.<Object>} - The stack that was waited for.
 */
exports.waitForStack = function (stackName, stackState) {
    winston.debug(`Waiting for ${stackName} to be in ${stackState}`);
    const cloudformation = new AWS.CloudFormation({
        apiVersion: '2010-05-15'
    });
    var waitParams = {
        StackName: stackName
    };
    return cloudformation.waitFor(stackState, waitParams).promise()
        .then(waitResponse => {
            winston.debug(`Stack ${stackName} is in ${stackState}`);
            return waitResponse.Stacks[0];
        });
}

/**
 * Given a stack name with template and parameters, creates the stack
 * 
 * This method will wait for the stack to be in a create complete state
 * before resolving the promise
 * 
 * @param {String} stackName - The name of the stack to create
 * @param {String} templateBody - A string containing the YAML or JSON CloudFormation template body
 * @param {Object} parameter - An object of key/value pairs that will be passed to the stack as parameters. Pass [] if you don't have parameters.
 * @param {Object} tags - An object of key/value pairs that will be added as tags to the stack
 * @returns {Promise.<Object>} - The stack that was created
 */
exports.createStack = function (stackName, templateBody, parameters, tags) {
    const cloudformation = new AWS.CloudFormation({
        apiVersion: '2010-05-15'
    });
    var params = {
        StackName: stackName,
        OnFailure: 'DELETE',
        Parameters: parameters,
        Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"],
        TemplateBody: templateBody,
        TimeoutInMinutes: 30
    };

    //Add tags to the stack if provided
    if (tags) {
        params.Tags = getCfTags(tags)
    }

    winston.debug(`Creating CloudFormation stack ${stackName}`);
    return cloudformation.createStack(params).promise()
        .then(createResult => {
            let stackId = createResult.StackId;
            winston.debug(`Created CloudFormation stack ${stackName}`);
            return exports.waitForStack(stackName, 'stackCreateComplete')
                .catch(err => {
                    return getErrorsForFailedStack(cloudformation, stackId)
                        .then(errors => {
                            throw new Error(getCfErrorMessage(stackName, errors));
                        });
                });
        });
}

/**
 * Given a stack name with template and parameters, updates the existing stack
 * 
 * This method will wait for the stack to be in an update complete state 
 * before resolving the promise.
 * 
 * @param {String} stackName - The name of the stack to update
 * @param {String} templateBody - A string containing the YAML or JSON CloudFormation template body
 * @param {Object} parameter - An object of key/value pairs that will be passed to the stack as parameters. Pass [] if you don't have parameters.
 * @param {Object} tags - An object of key/value pairs that will be added as tags to the stack
 * @returns {Promise.<Object>} - The stack that was created
 */
exports.updateStack = function (stackName, templateBody, parameters, tags) {
    const cloudformation = new AWS.CloudFormation({
        apiVersion: '2010-05-15'
    });
    var params = {
        StackName: stackName,
        Parameters: parameters,
        Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"],
        TemplateBody: templateBody
    };

    //Add tags to the stack if provided
    if (tags) {
        params.Tags = getCfTags(tags)
    }

    winston.debug(`Updating CloudFormation stack ${stackName}`);
    return cloudformation.updateStack(params).promise()
        .then(createResult => {
            let stackId = createResult.StackId;
            winston.debug(`Updated CloudFormation stack ${stackName}`);
            return exports.waitForStack(stackName, 'stackUpdateComplete')
                .catch(err => {
                    return getErrorsForFailedStack(cloudformation, stackId)
                        .then(errors => {
                            throw new Error(getCfErrorMessage(stackName, errors));
                        });
                });
        })
        .catch(err => {
            if (err.message.includes('No updates are to be performed')) {
                winston.debug(`No stack updates were required for stack ${stackName}`);
                return exports.getStack(stackName);
            }
            throw err;
        });
}

/**
 * Given a stack name, deletes the existing stack
 * 
 * This method will wait for the stack to be in the delete complete state
 * before resolving the promise
 * 
 * @param {String} stackName - The name of the stack to delete
 * @returns {boolean} - Whether the stack was deleted
 */
exports.deleteStack = function (stackName) {
    const cloudformation = new AWS.CloudFormation({
        apiVersion: '2010-05-15'
    });
    var deleteParams = {
        StackName: stackName
    };
    winston.debug(`Deleting CloudFormation stack ${stackName}`);
    return cloudformation.deleteStack(deleteParams).promise()
        .then(deleteResult => {
            var waitParams = {
                StackName: stackName
            };
            return cloudformation.waitFor('stackDeleteComplete', waitParams).promise()
                .then(waitResponse => {
                    return true;
                });
        });
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
exports.getCfStyleStackParameters = function (parametersObj) {
    let stackParameters = [];

    for (let key in parametersObj) {
        stackParameters.push({
            ParameterKey: key,
            ParameterValue: parametersObj[key],
            UsePreviousValue: false
        });
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
exports.getOutput = function (outputKey, cfStack) {
    for (let output of cfStack.Outputs) {
        if (output.OutputKey === outputKey) {
            return output.OutputValue;
        }
    }
    return null;
}