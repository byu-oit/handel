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
import {expect} from 'chai';
import 'mocha';
import * as sinon from 'sinon';
import awsWrapper from '../../src/aws/aws-wrapper';
import * as dynamoCalls from '../../src/aws/dynamodb-calls';

describe('dynamodb-calls', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getDynamoTable', () => {
        it('should return null on error or table not found', async () => {
            const describeTableStub = sandbox.stub(awsWrapper.dynamodb, 'describeTable').rejects({
                code: 'ResourceNotFoundException'
            });
            const result = await dynamoCalls.getDynamoTable('table-name');
            expect(describeTableStub.callCount).to.equal(1);
            expect(result).to.equal(null);
        });

        it('should return an object containing the table description on success', async () => {
            const describeTableStub = sandbox.stub(awsWrapper.dynamodb, 'describeTable').resolves({
                Table: {}
            });
            const result = await dynamoCalls.getDynamoTable('table-name');
            expect(describeTableStub.callCount).to.equal(1);
            expect(result).to.not.be.an('undefined');
        });
    });

    describe('createDynamoTable', () => {
        it('should return the table description on success', async () => {
            const createTableStub = sandbox.stub(awsWrapper.dynamodb, 'createTable').resolves({
                TableDescription: {
                    AttributeDefinitions: [
                        {
                            AttributeName: 'Key',
                            AttributeType: 'S'
                        }
                    ],
                    KeySchema: [
                        {
                            AttributeName: 'Key',
                            KeyType: 'HASH'
                        }
                    ],
                    TableName: 'Test',
                    TableStatus: 'CREATING'
                }
            });
            const describeTableStub = sandbox.stub(awsWrapper.dynamodb, 'describeTable').resolves({
                Table: {
                    AttributeDefinitions: [
                        {
                            AttributeName: 'Key',
                            AttributeType: 'S'
                        }
                    ],
                    KeySchema: [
                        {
                            AttributeName: 'Key',
                            KeyType: 'HASH'
                        }
                    ],
                    TableName: 'Test',
                    TableStatus: 'ACTIVE'
                }
            });
            const result = await dynamoCalls.createDynamoTable({
                AttributeDefinitions: [
                    {
                        AttributeName: 'Key',
                        AttributeType: 'S'
                    }
                ],
                KeySchema: [
                    {
                        AttributeName: 'Key',
                        KeyType: 'HASH'
                    }
                ],
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                },
                TableName: 'Test'
            });
            expect(createTableStub.callCount).to.equal(1);
            expect(describeTableStub.callCount).to.equal(1);
            expect(result).to.not.be.an('undefined');
            expect((result as AWS.DynamoDB.TableDescription).TableStatus).to.equal('ACTIVE');
        });
    });

    describe('putItem', () => {
        it('should succeed', async () => {
            const putItemStub = sandbox.stub(awsWrapper.dynamodb, 'putItem').resolves({
                ConsumedCapacity: {
                    CapacityUnits: 1,
                    TableName: 'Test'
                }
            });
            const result = await dynamoCalls.putItem('Test', {
                Attribute1: 'foo'
            });
            expect(putItemStub.callCount).to.equal(1);
            expect(result).to.equal(true);
        });
    });

    describe('makeSureDeploymentsLogTableExists', () => {
        it('should create table if table does not exist', async () => {
            const tableNotFoundStub = sandbox.stub(awsWrapper.dynamodb, 'describeTable').rejects({
                code: 'ResourceNotFoundException'
            });
            const createTableStub = sandbox.stub(awsWrapper.dynamodb, 'createTable').resolves({});
            const result = await dynamoCalls.makeSureDeploymentsLogTableExists();
            expect(tableNotFoundStub.callCount).to.equal(1);
            expect(createTableStub.callCount).to.equal(1);
            expect(result).to.not.be.an('error');
        });
        it ('should not re-create table if table already exists', async () => {
            const tableExistsStub = sandbox.stub(awsWrapper.dynamodb, 'describeTable').resolves({
                'Table': {}
            });
            const createTableStub = sandbox.stub(awsWrapper.dynamodb, 'createTable').resolves({});
            const result = await dynamoCalls.makeSureDeploymentsLogTableExists();
            expect(tableExistsStub.callCount).to.equal(1);
            expect(createTableStub.callCount).to.equal(0);
            expect(result).to.not.be.an('error');
        });
    });
    describe('logHandelAction', () => {
        it('should invoke putItem', async () => {
            const putItemStub = sandbox.stub(awsWrapper.dynamodb, 'putItem').resolves({
                ConsumedCapacity: {
                    CapacityUnits: 1,
                    TableName: dynamoCalls.handelDeploymentLogsTableName
                }
            });
            const result = await dynamoCalls.logHandelAction('deploy', {
                deploymentStartTime: Date.now(), message: '', environmentName: 'dev', status: 'success'
            }, {
                name: 'appName', environments: {}, extensions: {}, tags: {}, version: 1
            });
            expect(putItemStub.callCount).to.equal(1);
            expect(result).to.not.be.an('error');
        });
    });
});
