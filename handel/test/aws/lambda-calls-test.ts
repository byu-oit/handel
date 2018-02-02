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
import { expect } from 'chai';
import 'mocha';
import * as sinon from 'sinon';
import awsWrapper from '../../src/aws/aws-wrapper';
import * as lambdaCalls from '../../src/aws/lambda-calls';

describe('lambdaCalls', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('addLambdaPermission', () => {
        it('should add the given permission', async () => {
            const addPermissionStub = sandbox.stub(awsWrapper.lambda, 'addPermission').resolves({});
            const getPolicyStub = sandbox.stub(awsWrapper.lambda, 'getPolicy').resolves({
                Policy: `{
                    "Statement": [{
                        "Principal": {
                            "Service": "FakePrincipal"
                        },
                        "Condition": {
                            "ArnLike": {
                                "AWS:SourceArn": "FakeSourceArn"
                            }
                        }
                    }]
                }`
            });

            const statement = await lambdaCalls.addLambdaPermission('FakeFunction', 'FakePrincipal', 'FakeSourceArn');
            expect(statement).to.not.equal(null);
            expect(addPermissionStub.callCount).to.equal(1);
            expect(getPolicyStub.callCount).to.equal(1);
        });
    });

    describe('getLambdaPermission', () => {
        const principal = 'FakePrincipal';
        const sourceArn = 'FakeSourceArn';

        it('should return the given permission if present', async () => {
            const policy = {
                Statement: [{
                    Principal: {
                        Service: principal
                    },
                    Condition: {
                        ArnLike: {
                            'AWS:SourceArn': sourceArn
                        }
                    }
                }]
            };

            const getPolicyStub = sandbox.stub(awsWrapper.lambda, 'getPolicy').resolves({
                Policy: JSON.stringify(policy)
            });

            const statement = await lambdaCalls.getLambdaPermission('FakeFunctionName', principal, sourceArn);
            expect(statement).to.not.equal(null);
            expect(statement.Principal.Service).to.equal(principal);
            expect(statement.Condition.ArnLike['AWS:SourceArn']).to.equal(sourceArn);
        });

        it('should return null when the requested permissions is not present in the policy', async () => {
            const policy = {
                Statement: [{
                    Principal: {
                        Service: 'OtherPrincipal'
                    },
                    Condition: {
                        ArnLike: {
                            'AWS:SourceArn': 'OtherSourceArn'
                        }
                    }
                }]
            };

            const getPolicyStub = sandbox.stub(awsWrapper.lambda, 'getPolicy').resolves({
                Policy: JSON.stringify(policy)
            });

            const statement = await lambdaCalls.getLambdaPermission('FakeFunctionName', principal, sourceArn);
            expect(statement).to.equal(null);
        });

        it('should return null when there is no policy for the function', async () => {
            const getPolicyStub = sandbox.stub(awsWrapper.lambda, 'getPolicy').rejects({
                code: 'ResourceNotFoundException'
            });

            const statement = await lambdaCalls.getLambdaPermission('FakeFunctionName', 'FakePrincipal', 'FakeSourceArn');
            expect(statement).to.equal(null);
        });
    });

    describe('addLambdaPermissionIfNotExists', () => {
        it('should create the permission if it doesnt exist', async () => {
            const getPolicyStub = sandbox.stub(awsWrapper.lambda, 'getPolicy');
            getPolicyStub.onFirstCall().rejects({
                code: 'ResourceNotFoundException'
            });
            getPolicyStub.onSecondCall().resolves({
                Policy: `{
                    "Statement": [{
                        "Principal": {
                            "Service": "FakePrincipal"
                        },
                        "Condition": {
                            "ArnLike": {
                                "AWS:SourceArn": "FakeSourceArn"
                            }
                        }
                    }]
                }`
            });
            const addPermissionStub = sandbox.stub(awsWrapper.lambda, 'addPermission').resolves({});

            const statement = await lambdaCalls.addLambdaPermissionIfNotExists('FakeFunction', 'FakePrincipal', 'FakeSourceArn');
            expect(getPolicyStub.callCount).to.equal(2);
            expect(addPermissionStub.callCount).to.equal(1);
            expect(statement).to.not.equal(null);
        });

        it('should just return the permission statement if it already exists', async () => {
            const getPolicyStub = sandbox.stub(awsWrapper.lambda, 'getPolicy');
            getPolicyStub.onFirstCall().resolves({
                Policy: `{
                    "Statement": [{
                        "Principal": {
                            "Service": "FakePrincipal"
                        },
                        "Condition": {
                            "ArnLike": {
                                "AWS:SourceArn": "FakeSourceArn"
                            }
                        }
                    }]
                }`
            });

            const statement = await lambdaCalls.addLambdaPermissionIfNotExists('FakeFunction', 'FakePrincipal', 'FakeSourceArn');
            expect(getPolicyStub.callCount).to.equal(1);
            expect(statement).to.not.equal(null);
        });
    });

    describe('addLambdaEventSourceMapping', () => {
        it('should should create the Event Source Mapping for the lambda function and dynamodb table', async () => {
            const createMappingStub = sandbox.stub(awsWrapper.lambda, 'createEventSourceMapping').resolves({});

            const statement = await lambdaCalls.addLambdaEventSourceMapping('FakeFunctionName', 'FakeTableName', 'arn:aws:dynamodb:us-west-2:123456789012:table/TableName/stream/DATE', 100);
            expect(statement).to.equal(undefined);
            expect(createMappingStub.callCount).to.equal(1);
        });

        it('should should complete successfully if the Event Source Mapping already exists', async () => {
            const createMappingStub = sandbox.stub(awsWrapper.lambda, 'createEventSourceMapping').rejects({
                code: 'ResourceConflictException',
                message: 'The event source arn (arn:aws:dynamodb:us-west-2:398230616010:table/my-table-dev-table-dynamodb/stream/2017-08-16T20:02:21.326)  and function (my-table-dev-mylambda-lambda) provided mapping already exists. Please update or delete the existing mapping with UUID 160c2db9-cbec-42be-8133-ff5337e7cac5'
            });

            const statement = await lambdaCalls.addLambdaEventSourceMapping('FakeFunctionName', 'FakeTableName', 'arn:aws:dynamodb:us-west-2:123456789012:table/TableName/stream/DATE', 100);
            expect(statement).to.equal(undefined);
            expect(createMappingStub.callCount).to.equal(1);
        });
    });
});
