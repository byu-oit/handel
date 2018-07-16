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
import * as uuid from 'uuid';
import * as winston from 'winston';
import awsWrapper from './aws-wrapper';

function statementIsSame(functionName: string, principal: string, sourceArn: string | undefined, statement: any): boolean {
    if (statement.Principal.Service !== principal) {
        return false;
    }

    if (sourceArn && (!statement.Condition || !statement.Condition.ArnLike || statement.Condition.ArnLike['AWS:SourceArn'] !== sourceArn)) {
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

    winston.verbose(`Attempting to find permissions for ${principal} in function ${functionName}`);
    try {
        const getPolicyResponse = await awsWrapper.lambda.getPolicy(getPolicyParams);
        const policy = JSON.parse(getPolicyResponse.Policy!);
        for (const statement of policy.Statement) {
            if (statementIsSame(functionName, principal, sourceArn, statement)) {
                winston.verbose(`Found permission ${principal} in function ${functionName}`);
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

export async function addLambdaEventSourceMapping(functionName: string, resourceName: string, resourceArn: string, batchSize: number) {
    const deferred: any = {};
    deferred.promise = new Promise((resolve, reject) => {
        deferred.resolve = resolve;
        deferred.reject = reject;
    });

    // This deferred promise approach is used because we sometimes have to wait for IAM changes to propagate before we can create the mapping
    async function addLambdaEventSourceMappingWithRetry() {
        const createEventSourceParams: AWS.Lambda.CreateEventSourceMappingRequest = {
            EventSourceArn: resourceArn,
            FunctionName: functionName,
            BatchSize: batchSize,
            Enabled: true
        };
        if(resourceArn.includes('dynamo')) { // This is hacky, probably should be refactored
            createEventSourceParams.StartingPosition = 'LATEST';
        }
        // Other options (TRIM_HORIZON, AT_TIMESTAMP) are for Kinesis Streams Only
        winston.debug(`Adding Lambda Event Source Mapping to ${functionName} for ${resourceName}`);

        try {
            await awsWrapper.lambda.createEventSourceMapping(createEventSourceParams);
            winston.debug(`Added Lambda Event Source Mapping to ${functionName} for ${resourceName}`);
            deferred.resolve();
        }
        catch(err) {
            if (err.code === 'InvalidParameterValueException') { // Role doesn't have permissions yet
                setTimeout(() => {
                    addLambdaEventSourceMappingWithRetry();
                }, 5000);
            } else if (err.code === 'ResourceConflictException') { // The stream already exists
                winston.debug(`The Lambda Event Source Mapping for ${functionName} and ${resourceName} already exists`);
                deferred.resolve();
            } else {
                winston.debug(`Failed to add Lambda Event Source Mapping to ${functionName} for ${resourceName}`);
                deferred.reject(err);
            }
        }
    }
    await addLambdaEventSourceMappingWithRetry();

    return deferred.promise;
}

export async function listEventSourceMappings(functionName: string, marker?: string): Promise<AWS.Lambda.EventSourceMappingsList> {
    const listParams: AWS.Lambda.ListEventSourceMappingsRequest = {
        FunctionName: functionName,
    };
    if(marker) {
        listParams.Marker = marker;
    }

    // Get the mappings for this page
    const response = await awsWrapper.lambda.listEventSourceMappings(listParams);
    let eventSourceMappings: AWS.Lambda.EventSourceMappingsList = [];
    if(response.EventSourceMappings) {
        eventSourceMappings = response.EventSourceMappings;
    }

    // Get the rest of the mappings (if any)
    let restMappings: AWS.Lambda.EventSourceMappingsList = [];
    if(response.NextMarker) {
        restMappings = await listEventSourceMappings(functionName, response.NextMarker);
    }

    return eventSourceMappings.concat(restMappings);
}

export async function deleteEventSourceMapping(eventSourceMappingId: string) {
    const deleteParams: AWS.Lambda.DeleteEventSourceMappingRequest = {
        UUID: eventSourceMappingId
    };
    await awsWrapper.lambda.deleteEventSourceMapping(deleteParams);
    return true;
}

export async function deleteAllEventSourceMappings(functionName: string) {
    const eventSourceMappings = await listEventSourceMappings(functionName);
    await Promise.all(eventSourceMappings.map(mapping => {
        if(!mapping.UUID) {
            throw new Error('Expected event source mapping to have a UUID');
        }
        return deleteEventSourceMapping(mapping.UUID);
    }));
    return true;
}

export async function invokeLambda(functionName: string, input: any): Promise<any> {
    const response = await awsWrapper.lambda.invoke({
        FunctionName: functionName,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify(input)
    });

    return response.Payload ? JSON.parse((response.Payload as Buffer).toString('utf8')) : undefined;
}
