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
const accountConfig = require('../../lib/common/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const lambdaCalls = require('../../lib/aws/lambda-calls');
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
                });
        });
    });

    describe('getLambdaPermission', function () {
        it('should return the given permission if present', function () {
            let principal = "FakePrincipal";
            let sourceArn = "FakeSourceArn";
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
            let principal = "FakePrincipal";
            let sourceArn = "FakeSourceArn";
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
                    expect(getLambdaPermissionStub.calledOnce).to.be.true;
                    expect(addLambdaPermissionStub.calledOnce).to.be.true;
                    expect(statement).to.deep.equal({});
                });
        });

        it('should just return the permission statement if it already exists', function () {
            let getLambdaPermissionStub = sandbox.stub(lambdaCalls, 'getLambdaPermission').returns(Promise.resolve({}));
            let addLambdaPermissionStub = sandbox.stub(lambdaCalls, 'addLambdaPermission').returns(Promise.resolve(null));

            return lambdaCalls.addLambdaPermissionIfNotExists("FakeFunction", "FakePrincipal", "FakeSourceArn")
                .then(statement => {
                    expect(getLambdaPermissionStub.calledOnce).to.be.true;
                    expect(addLambdaPermissionStub.notCalled).to.be.true;
                    expect(statement).to.deep.equal({});
                });
        });
    });
});