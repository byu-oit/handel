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
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const lambdaCalls = require('../../dist/aws/lambda-calls');
const sinon = require('sinon');

describe('lambdaCalls', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
        AWS.restore('Lambda');
    });

    describe('addLambdaPermission', function () {
        it('should add the given permission', function () {
            AWS.mock('Lambda', 'addPermission', Promise.resolve({}));
            let getLambdaPermissionStub = sandbox.stub(lambdaCalls, 'getLambdaPermission').returns(Promise.resolve({}));

            lambdaCalls.addLambdaPermission("FakeFunction", "FakePrincipal", "FakeSourceArn")
                .then(statement => {
                    expect(statement).to.deep.equal({});
                    expect(getLambdaPermissionStub.callCount).to.equal(1);
                });
        });
    });

    describe('getLambdaPermission', function () {
        let principal = "FakePrincipal";
        let sourceArn = "FakeSourceArn";

        it('should return the given permission if present', function () {
            let policy = {
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
            }

            AWS.mock('Lambda', 'getPolicy', Promise.resolve({
                Policy: JSON.stringify(policy)
            }));

            return lambdaCalls.getLambdaPermission("FakeFunctionName", principal, sourceArn)
                .then(statement => {
                    expect(statement).to.not.be.null;
                    expect(statement.Principal.Service).to.equal(principal);
                    expect(statement.Condition.ArnLike['AWS:SourceArn']).to.equal(sourceArn);
                });
        });

        it('should return null when the requested permissions is not present in the policy', function () {
            let policy = {
                Statement: [{
                    Principal: {
                        Service: "OtherPrincipal"
                    },
                    Condition: {
                        ArnLike: {
                            'AWS:SourceArn': "OtherSourceArn"
                        }
                    }
                }]
            }

            AWS.mock('Lambda', 'getPolicy', Promise.resolve({
                Policy: JSON.stringify(policy)
            }));

            return lambdaCalls.getLambdaPermission("FakeFunctionName", principal, sourceArn)
                .then(statement => {
                    expect(statement).to.be.null;
                });
        });

        it('should return null when there is no policy for the function', function () {
            AWS.mock('Lambda', 'getPolicy', Promise.reject({
                code: 'ResourceNotFoundException'
            }));

            return lambdaCalls.getLambdaPermission("FakeFunctionName", "FakePrincipal", "FakeSourceArn")
                .then(statement => {
                    expect(statement).to.be.null;
                });
        });
    });

    describe('addLambdaPermissionIfNotExists', function () {
        it('should create the permission if it doesnt exist', function () {
            let getLambdaPermissionStub = sandbox.stub(lambdaCalls, 'getLambdaPermission').returns(Promise.resolve(null));
            let addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermission').returns(Promise.resolve({}));

            return lambdaCalls.addLambdaPermissionIfNotExists("FakeFunction", "FakePrincipal", "FakeSourceArn")
                .then(statement => {
                    expect(getLambdaPermissionStub.callCount).to.equal(1);
                    expect(addLambdaPermissionStub.callCount).to.equal(1);
                    expect(statement).to.deep.equal({});
                });
        });

        it('should just return the permission statement if it already exists', function () {
            let getLambdaPermissionStub = sandbox.stub(lambdaCalls, 'getLambdaPermission').returns(Promise.resolve({}));
            let addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermission').returns(Promise.resolve(null));

            return lambdaCalls.addLambdaPermissionIfNotExists("FakeFunction", "FakePrincipal", "FakeSourceArn")
                .then(statement => {
                    expect(getLambdaPermissionStub.callCount).to.equal(1);
                    expect(addLambdaPermissionStub.callCount).to.equal(0);
                    expect(statement).to.deep.equal({});
                });
        });
    });

    describe('addLambdaEventSourceMapping', function () {
        it('should should create the Event Source Mapping for the lambda function and dynamodb table', function () {
            AWS.mock('Lambda', 'createEventSourceMapping', Promise.resolve({}));

            return lambdaCalls.addLambdaEventSourceMapping("FakeFunctionName", "FakeTableName", "arn:aws:dynamodb:us-west-2:123456789012:table/TableName/stream/DATE", 100)
                .then(statement => {
                    expect(statement).to.be.undefined;
                });
        });

        it('should should complete successfully if the Event Source Mapping already exists', function () {
            AWS.mock('Lambda', 'createEventSourceMapping', Promise.reject({
                code: 'ResourceConflictException',
                message: "The event source arn (arn:aws:dynamodb:us-west-2:398230616010:table/my-table-dev-table-dynamodb/stream/2017-08-16T20:02:21.326)  and function (my-table-dev-mylambda-lambda) provided mapping already exists. Please update or delete the existing mapping with UUID 160c2db9-cbec-42be-8133-ff5337e7cac5"
            }));

            return lambdaCalls.addLambdaEventSourceMapping("FakeFunctionName", "FakeTableName", "arn:aws:dynamodb:us-west-2:123456789012:table/TableName/stream/DATE", 100)
                .then(statement => {
                    expect(statement).to.be.undefined;
                });
        });
    });
});