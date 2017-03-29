const winston = require('winston');
const AWS = require('aws-sdk');

exports.getStack = function(stackName) {
    const cloudformation = new AWS.CloudFormation({
        apiVersion: '2010-05-15'
    });
    var params = {
        StackName: stackName
    };
    return cloudformation.describeStacks(params).promise()
        .then(describeResult => {
            return describeResult.Stacks[0];
        })
        .catch(err => {
            if(err.code === "ValidationError") { //Stack does not exist
                return null;
            }
            throw err;
        });
}

exports.waitForStack = function(stackName, stackState) {
    winston.info(`Waiting for ${stackName} to be in ${stackState}`);
    const cloudformation = new AWS.CloudFormation({
        apiVersion: '2010-05-15'
    });
    var waitParams = {
        StackName: stackName
    };
    return cloudformation.waitFor(stackState, waitParams).promise()
        .then(waitResponse => {
            winston.info(`Stack ${stackName} is in ${stackState}`);
            return waitResponse.Stacks[0];
        });
}

exports.createStack = function(stackName, templateBody, parameters) {
    const cloudformation = new AWS.CloudFormation({
        apiVersion: '2010-05-15'
    });
    var params = {
        StackName: stackName,
        OnFailure: 'DELETE',
        Parameters: parameters,
        Capabilities: ["CAPABILITY_IAM"],
        TemplateBody: templateBody,
        TimeoutInMinutes: 30
    };
    return cloudformation.createStack(params).promise()
        .then(createResult => {
            return exports.waitForStack(stackName, 'stackCreateComplete')   
        });
}

exports.updateStack = function(stackName, templateBody, parameters) {
    const cloudformation = new AWS.CloudFormation({
        apiVersion: '2010-05-15'
    });
    var params = {
        StackName: stackName, 
        Parameters: parameters, 
        Capabilities: ["CAPABILITY_IAM"],
        TemplateBody:templateBody
    };
    return cloudformation.updateStack(params).promise()
        .then(createResult => {
            return exports.waitForStack(stackName, 'stackUpdateComplete')   
        })
        .catch(err => {
            if(err.message.includes('No updates are to be performed')) {
                return exports.getStack(stackName);
            }
            throw err;
        })
}

exports.getCfStyleStackParameters = function(parametersObj) {
    let stackParameters = [];

    for(let key in parametersObj) {
        stackParameters.push({
            ParameterKey: key,
            ParameterValue: parametersObj[key],
            UsePreviousValue: false
        });
    }

    return stackParameters;
}