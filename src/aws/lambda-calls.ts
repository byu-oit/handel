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
import * as uuid from 'uuid';
import * as winston from 'winston';
import awsWrapper from './aws-wrapper';

function statementIsSame(functionName: string, principal: string, sourceArn: string | undefined, statement: any): boolean {
    if (statement.Principal.Service !== principal) {
        return false;
    }

    if (!statement.Condition || !statement.Condition.ArnLike || statement.Condition.ArnLike['AWS:SourceArn'] !== sourceArn) {
        return false;
    }
    return true;
}

export async function addLambdaPermission(functionName: string, principal: string, sourceArn: string | undefined): Promise<any> {
    const addPermissionParams: AWS.Lambda.AddPermissionRequest = {
        Action: 'lambda:InvokeFunction',
        FunctionName: functionName,
        Principal: principal,
        SourceArn: sourceArn,
        StatementId: `${uuid()}`
    };

    winston.verbose(`Adding Lambda permission to ${functionName}`);
    const response = await awsWrapper.lambda.addPermission(addPermissionParams);
    winston.verbose(`Added Lambda permission to ${functionName}`);
    return getLambdaPermission(functionName, principal, sourceArn);
}

export async function getLambdaPermission(functionName: string, principal: string, sourceArn: string | undefined): Promise<any> {
    const getPolicyParams: AWS.Lambda.GetPolicyRequest = {
        FunctionName: functionName
    };

    winston.verbose(`Attempting to find permission ${sourceArn} in function ${functionName}`);
    try {
        const getPolicyResponse = await awsWrapper.lambda.getPolicy(getPolicyParams);
        const policy = JSON.parse(getPolicyResponse.Policy!);
        for (const statement of policy.Statement) {
            if (statementIsSame(functionName, principal, sourceArn, statement)) {
                winston.verbose(`Found permission ${sourceArn} in function ${functionName}`);
                return statement;
            }
        }
        winston.verbose(`Permission ${sourceArn} in function ${functionName} does not exist`);
        return null;
    }
    catch (err) {
        if (err.code === 'ResourceNotFoundException') {
            winston.verbose(`Permission ${sourceArn} in function ${functionName} does not exist`);
            return null;
        }
        throw err; // Throw error on any other kind of error
    }
}

export async function addLambdaPermissionIfNotExists(functionName: string, principal: string, sourceArn: string): Promise<any> {
    const permission = await getLambdaPermission(functionName, principal, sourceArn);
    if (!permission) {
        return addLambdaPermission(functionName, principal, sourceArn);
    }
    else {
        return permission;
    }
}

export async function addLambdaEventSourceMapping(functionName: string, tableName: string, streamArn: string, batchSize: number) {
    const deferred: any = {};
    deferred.promise = new Promise((resolve, reject) => {
        deferred.resolve = resolve;
        deferred.reject = reject;
    });

    async function addLambdaEventSourceMappingWithRetry() {
        const createEventSourceParams = {
            EventSourceArn: streamArn,
            FunctionName: functionName,
            StartingPosition: 'LATEST', // Other options (TRIM_HORIZON, AT_TIMESTAMP) are for Kinesis Streams Only
            BatchSize: batchSize,
            Enabled: true
        };
        winston.debug(`Adding Lambda Event Source Mapping to ${functionName} for ${tableName}`);

        try {
            await awsWrapper.lambda.createEventSourceMapping(createEventSourceParams);
            winston.debug(`Added Lambda Event Source Mapping to ${functionName} for ${tableName}`);
            deferred.resolve();
        }
        catch(err) {
            if (err.code === 'InvalidParameterValueException' && err.message.indexOf('Cannot access stream') !== -1) {
                setTimeout(() => {
                    addLambdaEventSourceMappingWithRetry();
                }, 5000);
            } else if (err.code === 'ResourceConflictException' && err.message.indexOf('provided mapping already exists') !== -1) {
                winston.debug(`The Lambda Event Source Mapping for ${functionName} and ${tableName} already exists`);
                deferred.resolve();
            } else {
                winston.debug(`Failed to add Lambda Event Source Mapping to ${functionName} for ${tableName}`)
                deferred.reject(err);
            }
        }
    }
    addLambdaEventSourceMappingWithRetry();

    return deferred.promise;
}
