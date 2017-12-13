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
const iamCalls = require('../../dist/aws/iam-calls');
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const sinon = require('sinon');

const config = require('../../dist/account-config/account-config');

describe('iam calls', function () {
    let sandbox;


    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
        AWS.restore('IAM');
    });
    
    describe('createRole', function () {
        it('should create the role', function () {
            let roleName = "FakeRole"
            AWS.mock('IAM', 'createRole', Promise.resolve({
                Role: {}
            }));

            return iamCalls.createRole(roleName, "SomeTrustedService")
                .then(role => {
                    expect(role).to.deep.equal({})
                })
        });
    });

    describe('getRole', function () {
        it('should return the role when it exists', function () {
            AWS.mock('IAM', 'getRole', Promise.resolve({
                Role: {}
            }));

            return iamCalls.getRole("FakeRole")
                .then(role => {
                    expect(role).to.deep.equal({});
                });
        });

        it('should return null when the role doesnt exist', function () {
            AWS.mock('IAM', 'getRole', Promise.reject({
                code: "NoSuchEntity"
            }));

            return iamCalls.getRole("FakeRole")
                .then(role => {
                    expect(role).to.be.null;
                });
        });

        it('should throw an error on any other error', function () {
            let errorCode = "OtherError";
            AWS.mock('IAM', 'getRole', Promise.reject({
                code: errorCode
            }));

            return iamCalls.getRole("FakeRole")
                .then(role => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.code).to.equal(errorCode);
                })
        });
    });

    describe('createRoleIfNotExists', function () {
        it('should create the role when it doesnt exist', function () {
            let getRoleStub = sandbox.stub(iamCalls, 'getRole').returns(Promise.resolve(null));
            let createRoleStub = sandbox.stub(iamCalls, 'createRole').returns(Promise.resolve({}));

            return iamCalls.createRoleIfNotExists("FakeRole", "TrustedService")
                .then(role => {
                    expect(role).to.deep.equal({});
                    expect(getRoleStub.callCount).to.equal(1);
                    expect(createRoleStub.callCount).to.equal(1);
                });
        });

        it('should just return the role when it already exists', function () {
            let getRoleStub = sandbox.stub(iamCalls, 'getRole').returns(Promise.resolve({}));

            return iamCalls.createRoleIfNotExists("FakeRole", "TrustedService")
                .then(role => {
                    expect(role).to.deep.equal({});
                    expect(getRoleStub.callCount).to.equal(1);
                });
        });
    });

    describe('getPolicy', function () {
        it('should return the policy when it exists', function () {
            AWS.mock('IAM', 'getPolicy', Promise.resolve({
                Policy: {}
            }));

            return iamCalls.getPolicy("FakeArn")
                .then(policy => {
                    expect(policy).to.deep.equal({});
                });
        });

        it('should return null when the policy doesnt exist', function () {
            AWS.mock('IAM', 'getPolicy', Promise.reject({
                code: "NoSuchEntity"
            }));

            return iamCalls.getPolicy("FakeArn")
                .then(policy => {
                    expect(policy).to.be.null;
                });
        });
    });

    describe('createPolicy', function () {
        it('should create the policy', function () {
            AWS.mock('IAM', 'createPolicy', Promise.resolve({
                Policy: {}
            }));

            return iamCalls.createPolicy("PolicyName", {})
                .then(policy => {
                    expect(policy).to.deep.equal({});
                });
        });
    });

    describe('createPolicyVersion', function () {
        it('should create the version on the existing policy', function () {
            AWS.mock('IAM', 'createPolicyVersion', Promise.resolve({
                PolicyVersion: {}
            }));

            return iamCalls.createPolicyVersion("PolicyArn", {})
                .then(policyVersion => {
                    expect(policyVersion).to.deep.equal({});
                });
        });
    });

    describe('deleteAllPolicyVersionsButProvided', function () {
        it('should delete all policy versions but the one provided', function () {
            let policyVersionToKeep = {
                VersionId: 'v2'
            }
            AWS.mock('IAM', 'listPolicyVersions', Promise.resolve({
                Versions: [
                    {
                        VersionId: 'v1'
                    },
                    policyVersionToKeep
                ]
            }));
            AWS.mock('IAM', 'deletePolicyVersion', Promise.resolve({}));

            return iamCalls.deleteAllPolicyVersionsButProvided("FakeArn", policyVersionToKeep)
                .then(policyVersionKept => {
                    expect(policyVersionKept.VersionId).to.equal('v2');
                });
        });
    });

    describe('attachPolicyToRole', function () {
        it('should attach the policy to the role', function () {
            AWS.mock('IAM', 'attachRolePolicy', Promise.resolve({}));

            return iamCalls.attachPolicyToRole('FakeArn', 'FakeRole')
                .then(response => {
                    expect(response).to.deep.equal({});
                });
        });
    });

    describe('createOrUpdatePolicy', function () {
        it('should create the policy when it doesnt exist', function () {
            let getPolicyStub = sandbox.stub(iamCalls, 'getPolicy').returns(Promise.resolve(null));
            let createPolicyStub = sandbox.stub(iamCalls, 'createPolicy').returns(Promise.resolve({}));

            return iamCalls.createOrUpdatePolicy('FakePolicy', 'FakeArn', {})
                .then(policy => {
                    expect(policy).to.deep.equal({});
                    expect(getPolicyStub.callCount).to.equal(1);
                    expect(createPolicyStub.callCount).to.equal(1);
                });
        });

        it('should update the policy when it exists', function () {
            let getPolicyStub = sandbox.stub(iamCalls, 'getPolicy').returns(Promise.resolve({}));
            let createPolicyVersionStub = sandbox.stub(iamCalls, 'createPolicyVersion').returns(Promise.resolve({}));
            let deleteVersionsStub = sandbox.stub(iamCalls, 'deleteAllPolicyVersionsButProvided').returns(Promise.resolve({}));

            return iamCalls.createOrUpdatePolicy('FakePolicy', 'FakeArn', {})
                .then(policy => {
                    expect(policy).to.deep.equal({});
                    expect(getPolicyStub.callCount).to.equal(2);
                    expect(createPolicyVersionStub.callCount).to.equal(1);
                    expect(deleteVersionsStub.callCount).to.equal(1);
                });
        });
    });

    describe('createPolicyIfNotExists', function () {
        it('should create the policy when it doesnt exist', function () {
            let getPolicyStub = sandbox.stub(iamCalls, 'getPolicy').returns(Promise.resolve(null));
            let createPolicyStub = sandbox.stub(iamCalls, 'createPolicy').returns(Promise.resolve({}));

            return iamCalls.createPolicyIfNotExists('FakePolicy', 'FakeArn', {})
                .then(policy => {
                    expect(policy).to.deep.equal({});
                    expect(getPolicyStub.callCount).to.equal(1);
                    expect(createPolicyStub.callCount).to.equal(1);
                });
        });

        it('should just return the policy when it exists', function () {
            let getPolicyStub = sandbox.stub(iamCalls, 'getPolicy').returns(Promise.resolve({}));
            let createPolicyStub = sandbox.stub(iamCalls, 'createPolicy').returns(Promise.resolve({}));

            return iamCalls.createPolicyIfNotExists('FakePolicy', 'FakeArn', {})
                .then(policy => {
                    expect(policy).to.deep.equal({});
                    expect(getPolicyStub.callCount).to.equal(1);
                    expect(createPolicyStub.callCount).to.equal(0);
                });
        });
    });

    describe('attachStreamPolicy', function () {
        it('should attach a stream policy to the existing lambda role', function () {
            let constructPolicyDocStub = sandbox.stub(iamCalls, 'constructPolicyDoc').returns(Promise.resolve({
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": [
                            "dynamodb:DescribeStream",
                            "dynamodb:GetRecords",
                            "dynamodb:GetShardIterator",
                            "dynamodb:ListStreams"
                        ],
                        "Resource": "arn:aws:dynamodb:region:accountID:table/FakeTable/stream/*"
                    }
                ]
            }))
            let createOrUpdatePolicyStub = sandbox.stub(iamCalls, 'createOrUpdatePolicy').returns(Promise.resolve({}))
            let attachPolicyToRoleStub = sandbox.stub(iamCalls, 'attachPolicyToRole').returns(Promise.resolve({}));

            return config(`${__dirname}/../test-account-config.yml`)
                .then(accountConfig => {
                    return iamCalls.attachStreamPolicy('FakeRole', constructPolicyDocStub, accountConfig)
                        .then((policy) => {
                            expect(policy).to.deep.equal({});
                            expect(createOrUpdatePolicyStub.callCount).to.equal(1);
                            expect(attachPolicyToRoleStub.callCount).to.equal(1);
                        });
                });
        });
    });

    describe('detachPoliciesFromRole', function () {
        it('should detach all policies from role', function () {
            let getRoleStub = sandbox.stub(iamCalls, 'getRole').returns(Promise.resolve({}));
            AWS.mock('IAM', 'listAttachedRolePolicies', Promise.resolve({
                AttachedPolicies: [
                    {
                        PolicyArn: "arn:aws:iam::398230616010:policy/services/LambdaDynamodbStream-my-table-dev-mylambda-lambda",
                    }
                ]
            }));
            AWS.mock('IAM', 'detachRolePolicy', Promise.resolve({}));

            return iamCalls.detachPoliciesFromRole('FakeRoleName')
                .then((response) => {
                    expect(getRoleStub.callCount).to.equal(1);
                    expect(response).to.deep.equal([{}]);
                });
        });

        it('should return successful if the role was already deleted', function () {
            let getRoleStub = sandbox.stub(iamCalls, 'getRole').returns(Promise.resolve(null));
            return iamCalls.detachPoliciesFromRole('FakeRoleName')
                .then((response) => {
                    expect(getRoleStub.callCount).to.equal(1);
                    expect(response).to.deep.equal([]);
                });
        });
    });
});
