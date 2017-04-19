const AWS = require('aws-sdk');
const winston = require('winston');
const uuid = require('uuid');


function statementIsSame(functionName, principal, sourceArn, statement) {
    if(statement.Principal.Service !== principal) {
        return false;
    }

    if(!statement.Condition || !statement.Condition.ArnLike || statement.Condition.ArnLike['AWS:SourceArn'] !== sourceArn) {
        return false;
    }
    return true;
}


exports.addLambdaPermission = function(functionName, principal, sourceArn) {
    let lambda = new AWS.Lambda({apiVersion: '2015-03-31'});
    var addPermissionParams = {
        Action: "lambda:InvokeFunction", 
        FunctionName: functionName, 
        Principal: principal, 
        SourceArn: sourceArn,
        StatementId: `${uuid()}`
    };
    winston.debug(`Adding Lambda permission to ${functionName}`);
    return lambda.addPermission(addPermissionParams).promise()
        .then(response => {
            winston.debug(`Added Lambda permission to ${functionName}`);
            return exports.getLambdaPermission(functionName, principal, sourceArn);
        });
}

exports.getLambdaPermission = function(functionName, principal, sourceArn) {
    let lambda = new AWS.Lambda({apiVersion: '2015-03-31'});
    var params = {
        FunctionName: functionName
    };
    winston.debug(`Attempting to find permission ${sourceArn} in function ${functionName}`);
    return lambda.getPolicy(params).promise()
        .then(getPolicyResponse => {
            let policy = JSON.parse(getPolicyResponse.Policy);
            for(let statement of policy.Statement) {
                if(statementIsSame(functionName, principal, sourceArn, statement)) {
                    winston.debug(`Found permission ${sourceArn} in function ${functionName}`);
                    return statement;
                }
            }
            winston.debug(`Permission ${sourceArn} in function ${functionName} does not exist`);
            return null;
        })
        .catch(err => {
            if(err.code === 'ResourceNotFoundException') {
                winston.debug(`Permission ${sourceArn} in function ${functionName} does not exist`);
                return null;
            }
            throw err; //Throw error on any other kind of error
        });
}

exports.addLambdaPermissionIfNotExists = function(functionName, principal, sourceArn) {
    return exports.getLambdaPermission(functionName, principal, sourceArn)
        .then(permission => {
            if(!permission) {
                return exports.addLambdaPermission(functionName, principal, sourceArn);
            }
            else {
                return permission;
            }
        });
}