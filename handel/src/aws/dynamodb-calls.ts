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
import {HandelFile} from '../datatypes';
import {EnvironmentResult} from '../datatypes';
import awsWrapper from './aws-wrapper';

export const handelDeploymentLogsTableName = 'handel-deployment-logs';

async function sleepAwait(ms: number) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    });
}

export async function getDynamoTable(tableName: string): Promise<AWS.DynamoDB.TableDescription | null> {
    const describeTableParams = {
        TableName: tableName
    };
    try {
        const getResponse = await awsWrapper.dynamodb.describeTable(describeTableParams);
        return getResponse.Table!;
    } catch (e) {
        if (e.code === 'ResourceNotFoundException') {
            return null;
        }
        throw e;
    }
}

export async function createDynamoTable(createTableParams: AWS.DynamoDB.CreateTableInput): Promise<AWS.DynamoDB.TableDescription | null> {
    try {
        await awsWrapper.dynamodb.createTable(createTableParams);
        // check every second if the created table is in an active status
        for(;;) {
            await sleepAwait(1000);
            const table = await getDynamoTable(createTableParams.TableName);
            if (table !== null) {
                if ((table as AWS.DynamoDB.TableDescription).TableStatus === 'ACTIVE') {
                    return table;
                }
            } else {
                return null;
            }
        }
    } catch (e) {
        return null;
    }
}

export async function putItem(tableName: string, item: any): Promise<boolean> {
    const putItemParams = {
        TableName: tableName,
        Item: item
    };
    try {
        await awsWrapper.dynamodb.putItem(putItemParams);
        return true;
    } catch (e) {
        // Maybe we want to log the error?
        return false;
    }
}

export async function makeSureDeploymentsLogTableExists(): Promise<void> {
    const dynamoTable = await getDynamoTable(handelDeploymentLogsTableName);
    if (dynamoTable === null) {
        await createDynamoTable({
            AttributeDefinitions: [
                {
                    AttributeName: 'AppName',
                    AttributeType: 'S'
                },
                {
                    AttributeName: 'EnvAction',
                    AttributeType: 'S'
                }
            ],
            KeySchema: [
                {
                    AttributeName: 'AppName',
                    KeyType: 'HASH'
                },
                {
                    AttributeName: 'EnvAction',
                    KeyType: 'RANGE'
                }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            },
            TableName: handelDeploymentLogsTableName
        });
    }
}

export async function logHandelAction(lifecycleName: string, envResult: EnvironmentResult, handelFile: HandelFile): Promise<void> {
    const endTime = Date.now();
    await putItem(handelDeploymentLogsTableName, {
        AppName: handelFile.name,
        EnvAction: envResult.environmentName + ':' + lifecycleName + ':' + endTime,
        Lifecycle: lifecycleName,
        DeploymentStartTime: envResult.deploymentStartTime,
        DeploymentEndTime: endTime.toString(),
        EnvironmentName: envResult.environmentName,
        DeploymentStatus: envResult.status,
        DeploymentMessage: envResult.message,
        ApplicationTags: handelFile.tags || {},
        EnvironmentContents: handelFile.environments[envResult.environmentName]
    });
    // TODO find a way to insert the GIT commit hash and/or pipeline name
}
