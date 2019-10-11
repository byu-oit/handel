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
import config from '../../src/account-config/account-config';
import awsWrapper from '../../src/aws/aws-wrapper';
import * as iamCalls from '../../src/aws/iam-calls';

describe('iam calls', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('createRole', () => {
        it('should create the role', async () => {
            const roleName = 'FakeRole';
            const createRoleStub = sandbox.stub(awsWrapper.iam, 'createRole').resolves({
                Role: {}
            });

            const role = await iamCalls.createRole(roleName, 'SomeTrustedService');
            expect(createRoleStub.callCount).to.equal(1);
            expect(role).to.deep.equal({});
        });
    });

    describe('createRoleWithPermissionsBoundary', () => {
        it('should create the role with a permissions boundary', async () => {
            const roleName = 'FakeRole';
            const createRoleStub = sandbox.stub(awsWrapper.iam, 'createRole').resolves({
                Role: {}
            });

            const role = await iamCalls.createRole(roleName, 'SomeTrustedService', 'arn:aws:iam::111111111111:policy/SomePermissionsBoundary');
            expect(createRoleStub.callCount).to.equal(1);
            expect(role).to.deep.equal({});
        });
    });

    describe('getRole', () => {
        it('should return the role when it exists', async () => {
            const getRoleStub = sandbox.stub(awsWrapper.iam, 'getRole').resolves({
                Role: {}
            });

            const role = await iamCalls.getRole('FakeRole');
            expect(getRoleStub.callCount).to.equal(1);
            expect(role).to.deep.equal({});
        });

        it('should return null when the role doesnt exist', async () => {
            const getRoleStub = sandbox.stub(awsWrapper.iam, 'getRole').rejects({
                code: 'NoSuchEntity'
            });

            const role = await iamCalls.getRole('FakeRole');
            expect(getRoleStub.callCount).to.equal(1);
            expect(role).to.equal(null);
        });

        it('should throw an error on any other error', async () => {
            const errorCode = 'OtherError';
            const getRoleStub = sandbox.stub(awsWrapper.iam, 'getRole').rejects({
                code: errorCode
            });

            try {
                await iamCalls.getRole('FakeRole');
                expect(true).to.equal(false); // Should not get here
            }
            catch (err) {
                expect(getRoleStub.callCount).to.equal(1);
                expect(err.code).to.equal(errorCode);
            }
        });
    });

    describe('createRoleIfNotExists', () => {
        it('should create the role when it doesnt exist', async () => {
            const getRoleStub = sandbox.stub(awsWrapper.iam, 'getRole').rejects({
                code: 'NoSuchEntity'
            });
            const createRoleStub = sandbox.stub(awsWrapper.iam, 'createRole').resolves({
                Role: {}
            });

            const role = await iamCalls.createRoleIfNotExists('FakeRole', 'TrustedService');
            expect(role).to.deep.equal({});
            expect(getRoleStub.callCount).to.equal(1);
            expect(createRoleStub.callCount).to.equal(1);
        });

        it('should just return the role when it already exists', async () => {
            const getRoleStub = sandbox.stub(awsWrapper.iam, 'getRole').resolves({
                Role: {}
            });

            const role = await iamCalls.createRoleIfNotExists('FakeRole', 'TrustedService');
            expect(role).to.deep.equal({});
            expect(getRoleStub.callCount).to.equal(1);
        });
    });

    describe('getPolicy', () => {
        it('should return the policy when it exists', async () => {
            const getPolicyStub = sandbox.stub(awsWrapper.iam, 'getPolicy').resolves({
                Policy: {}
            });

            const policy = await iamCalls.getPolicy('FakeArn');
            expect(getPolicyStub.callCount).to.equal(1);
            expect(policy).to.deep.equal({});
        });

        it('should return null when the policy doesnt exist', async () => {
            const getPolicyStub = sandbox.stub(awsWrapper.iam, 'getPolicy').rejects({
                code: 'NoSuchEntity'
            });

            const policy = await iamCalls.getPolicy('FakeArn');
            expect(getPolicyStub.callCount).to.equal(1);
            expect(policy).to.equal(null);
        });
    });

    describe('createPolicy', () => {
        it('should create the policy', async () => {
            const createPolicyStub = sandbox.stub(awsWrapper.iam, 'createPolicy').resolves({
                Policy: {}
            });

            const policy = await iamCalls.createPolicy('PolicyName', {});
            expect(createPolicyStub.callCount).to.equal(1);
            expect(policy).to.deep.equal({});
        });
    });

    describe('createPolicyVersion', () => {
        it('should create the version on the existing policy', async () => {
            const createPolicyVersionStub = sandbox.stub(awsWrapper.iam, 'createPolicyVersion').resolves({
                PolicyVersion: {}
            });

            const policyVersion = await iamCalls.createPolicyVersion('PolicyArn', {});
            expect(createPolicyVersionStub.callCount).to.equal(1);
            expect(policyVersion).to.deep.equal({});
        });
    });

    describe('deleteAllPolicyVersionsButProvided', () => {
        it('should delete all policy versions but the one provided', async () => {
            const policyVersionToKeep = {
                VersionId: 'v2'
            };
            const listPolicyVersionsStub = sandbox.stub(awsWrapper.iam, 'listPolicyVersions').resolves({
                Versions: [
                    {
                        VersionId: 'v1'
                    },
                    policyVersionToKeep,
                    {
                        VersionId: 'v3'
                    }
                ]
            });
            const deletePolicyVersionStub = sandbox.stub(awsWrapper.iam, 'deletePolicyVersion').resolves({});

            const policyVersionKept = await iamCalls.deleteAllPolicyVersionsButProvided('FakeArn', policyVersionToKeep);

            expect(listPolicyVersionsStub.callCount).to.equal(1);
            expect(deletePolicyVersionStub.callCount).to.equal(2);
            expect(policyVersionKept.VersionId).to.equal('v2');
        });
    });

    describe('attachPolicyToRole', () => {
        it('should attach the policy to the role', async () => {
            const attachPolicyStub = sandbox.stub(awsWrapper.iam, 'attachRolePolicy').resolves({});

            const response = await iamCalls.attachPolicyToRole('FakeArn', 'FakeRole');

            expect(attachPolicyStub.callCount).to.equal(1);
            expect(response).to.deep.equal({});
        });
    });

    describe('createOrUpdatePolicy', () => {
        it('should create the policy when it doesnt exist', async () => {
            const getPolicyStub = sandbox.stub(awsWrapper.iam, 'getPolicy').rejects({
                code: 'NoSuchEntity'
            });
            const createPolicyStub = sandbox.stub(awsWrapper.iam, 'createPolicy').resolves({
                Policy: {}
            });

            const policy = await iamCalls.createOrUpdatePolicy('FakePolicy', 'FakeArn', {});
            expect(policy).to.deep.equal({});
            expect(getPolicyStub.callCount).to.equal(1);
            expect(createPolicyStub.callCount).to.equal(1);
        });

        it('should update the policy when it exists', async () => {
            const versionToKeep = 'FakeVersion';
            const getPolicyStub = sandbox.stub(awsWrapper.iam, 'getPolicy').resolves({
                Policy: {}
            });
            const createPolicyVersionStub = sandbox.stub(awsWrapper.iam, 'createPolicyVersion').resolves({
                PolicyVersion: {
                    VersionId: versionToKeep
                }
            });
            const listPolicyVersionsStub = sandbox.stub(awsWrapper.iam, 'listPolicyVersions').resolves({
                Versions: [{
                    VersionId: versionToKeep
                }, {
                    VersionId: 'OtherVersion'
                }]
            });
            const deletePolicyVersionStub = sandbox.stub(awsWrapper.iam, 'deletePolicyVersion').resolves({});

            const policy = await iamCalls.createOrUpdatePolicy('FakePolicy', 'FakeArn', {});
            expect(policy).to.deep.equal({});
            expect(getPolicyStub.callCount).to.equal(2);
            expect(createPolicyVersionStub.callCount).to.equal(1);
            expect(listPolicyVersionsStub.callCount).to.equal(1);
            expect(deletePolicyVersionStub.callCount).to.equal(1);
        });
    });

    describe('createPolicyIfNotExists', () => {
        it('should create the policy when it doesnt exist', async () => {
            const getPolicyStub = sandbox.stub(awsWrapper.iam, 'getPolicy').rejects({
                code: 'NoSuchEntity'
            });
            const createPolicyStub = sandbox.stub(awsWrapper.iam, 'createPolicy').resolves({
                Policy: {}
            });

            const policy = await iamCalls.createPolicyIfNotExists('FakePolicy', 'FakeArn', {});
            expect(policy).to.deep.equal({});
            expect(getPolicyStub.callCount).to.equal(1);
            expect(createPolicyStub.callCount).to.equal(1);
        });

        it('should just return the policy when it exists', async () => {
            const getPolicyStub = sandbox.stub(awsWrapper.iam, 'getPolicy').resolves({
                Policy: {}
            });
            const createPolicyStub = sandbox.stub(awsWrapper.iam, 'createPolicy').resolves({
                Policy: {}
            });

            const policy = await iamCalls.createPolicyIfNotExists('FakePolicy', 'FakeArn', {});
            expect(policy).to.deep.equal({});
            expect(getPolicyStub.callCount).to.equal(1);
            expect(createPolicyStub.callCount).to.equal(0);
        });
    });

    describe('listAttachedPolicies', () => {
        it('should return the list of attached policies', async () => {
            const listPoliciesStub = sandbox.stub(awsWrapper.iam, 'listAttachedRolePolicies').resolves({
                AttachedPolicies: [{
                    PolicyArn: 'Fake'
                }]
            });
            const policies = await iamCalls.listAttachedPolicies('FakeRole');
            expect(listPoliciesStub.callCount).to.equal(1);
            expect(policies.length).to.equal(1);
            expect(policies[0].PolicyArn).to.equal('Fake');
        });
    });

    describe('detachPolicyFromRole', () => {
        it('should detach the given policy from the role', async () => {
            const detachPolicyStub = sandbox.stub(awsWrapper.iam, 'detachRolePolicy').resolves({});
            await iamCalls.detachPolicyFromRole('FakeRole', {
                PolicyArn: 'FakeArn',
                PolicyName: 'FakeName'
            });
            expect(detachPolicyStub.callCount).to.equal(1);
        });
    });

    describe('deletePolicy', () => {
        it('should delete the given policy', async () => {
            const deletePolicyStub = sandbox.stub(awsWrapper.iam, 'deletePolicy').resolves({});
            await iamCalls.deletePolicy('FakeArn');
            expect(deletePolicyStub.callCount).to.equal(1);
        });
    });

    describe('createServiceLinkedRole', () => {
        it('should create the policy if it doesnt exist', async () => {
            const createRoleStub = sandbox.stub(awsWrapper.iam, 'createServiceLinkedRole').resolves({});
            await iamCalls.createServiceLinkedRole('fakeservice.amazonaws.com');
            expect(createRoleStub.callCount).to.equal(1);
        });

        it('should return successfully if the policy already exists', async () => {
            const createRoleStub = sandbox.stub(awsWrapper.iam, 'createServiceLinkedRole').rejects({
                code: 'InvalidInput'
            });
            await iamCalls.createServiceLinkedRole('fakeservice.amazonaws.com');
            expect(createRoleStub.callCount).to.equal(1);
        });

        it('should throw an error on any other kind of AWS error', async () => {
            const createRoleStub = sandbox.stub(awsWrapper.iam, 'createServiceLinkedRole').rejects({
                code: 'OtherError'
            });
            try {
                await iamCalls.createServiceLinkedRole('fakeservice.amazonaws.com');
                expect(true).to.equal(false); // Should not get here
            } catch(err) {
                expect(createRoleStub.callCount).to.equal(1);
            }
        });
    });
});
