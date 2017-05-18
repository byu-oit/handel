const winston = require('winston');
const AWS = require('aws-sdk');

/**
 * Given a stack name, returns the stack, or null if it doesnt exist
 * 
 * @param {String} stackName - The name of the stack to get
 * @returns - The CloudFormation Stack, or null if it doesnt exist
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
 * @returns
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

exports.createStack = function (stackName, templateBody, parameters) {
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
    winston.debug(`Creating CloudFormation stack ${stackName}`);
    return cloudformation.createStack(params).promise()
        .then(createResult => {
            winston.debug(`Created CloudFormation stack ${stackName}`);
            return exports.waitForStack(stackName, 'stackCreateComplete')
        });
}

exports.updateStack = function (stackName, templateBody, parameters) {
    const cloudformation = new AWS.CloudFormation({
        apiVersion: '2010-05-15'
    });
    var params = {
        StackName: stackName,
        Parameters: parameters,
        Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"],
        TemplateBody: templateBody
    };
    winston.debug(`Updating CloudFormation stack ${stackName}`);
    return cloudformation.updateStack(params).promise()
        .then(createResult => {
            winston.debug(`Updated CloudFormation stack ${stackName}`);
            return exports.waitForStack(stackName, 'stackUpdateComplete')
        })
        .catch(err => {
            if (err.message.includes('No updates are to be performed')) {
                winston.debug(`No stack updates were required for stack ${stackName}`);
                return exports.getStack(stackName);
            }
            throw err;
        })
}

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
 * Returns null if key is not found
 */
exports.getOutput = function (outputKey, cfStack) {
    for (let output of cfStack.Outputs) {
        if (output.OutputKey === outputKey) {
            return output.OutputValue;
        }
    }
    return null;
}