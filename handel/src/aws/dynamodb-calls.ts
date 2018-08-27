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
import awsWrapper from './aws-wrapper';

export async function getDynamoTable(tableName: string): Promise<AWS.DynamoDB.TableDescription|null> {
    const describeTableParams = {
        TableName: tableName
    };
    const getResponse = await awsWrapper.dynamodb.describeTable(describeTableParams);
    return getResponse.Table!;
}

export async function createDynamoTable(createTableParams: AWS.DynamoDB.CreateTableInput): Promise<AWS.DynamoDB.TableDescription|undefined> {
    const createResponse = await awsWrapper.dynamodb.createTable(createTableParams);
    console.log('here - ', createResponse);
    return createResponse.TableDescription;
}

export async function putItem(tableName: string, item: any): Promise<boolean> {
    const putItemParams = {
        TableName: tableName,
        Item: item
    };
    const putResult = await awsWrapper.dynamodb.putItem(putItemParams);
    return true;
}
