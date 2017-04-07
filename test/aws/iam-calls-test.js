const iamCalls = require('../../lib/aws/iam-calls');
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const sinon = require('sinon');

describe('iam calls', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('createRole', function() {
        it('should create the role', function() {
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

    describe('getRole', function() {
        it('should return the role when it exists', function() {
            AWS.mock('IAM', 'getRole', Promise.resolve({
                Role: {}
            }));

            return iamCalls.getRole("FakeRole")
                .then(role => {
                    expect(role).to.deep.equal({});
                    AWS.restore('IAM');
                });
        });

        it('should return null when the role doesnt exist', function() {
            AWS.mock('IAM', 'getRole', Promise.reject({
                code: "NoSuchEntity"
            }));

            return iamCalls.getRole("FakeRole")
                .then(role => {
                    expect(role).to.be.null;
                    AWS.restore('IAM');
                });
        });

        it('should throw an error on any other error', function() {
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
                    AWS.restore('IAM');
                })
        });
    });

    describe('createRoleIfNotExists', function() {
        it('should create the role when it doesnt exist', function() {
            sandbox.stub(iamCalls, 'getRole').returns(Promise.resolve(null));
            sandbox.stub(iamCalls, 'createRole').returns(Promise.resolve({}));

            return iamCalls.createRoleIfNotExists("FakeRole", "TrustedService")
                .then(role => {
                    expect(role).to.deep.equal({});
                });
        });

        it('should just return the role when it already exists', function() {
            sandbox.stub(iamCalls, 'getRole').returns(Promise.resolve({}));

            return iamCalls.createRoleIfNotExists("FakeRole", "TrustedService")
                .then(role => {
                    expect(role).to.deep.equal({});
                });
        });
    });

    describe('getPolicy', function() {
        it('should return the policy when it exists', function() {
            AWS.mock('IAM', 'getPolicy', Promise.resolve({
                Policy: {}
            }));

            return iamCalls.getPolicy("FakeArn")
                .then(policy => {
                    expect(policy).to.deep.equal({});
                    AWS.restore('IAM');
                });
        });

        it('should return null when the policy doesnt exist', function() {
            AWS.mock('IAM', 'getPolicy', Promise.reject({
                code: "NoSuchEntity"
            }));

            return iamCalls.getPolicy("FakeArn")
                .then(policy => {
                    expect(policy).to.be.null;
                    AWS.restore('IAM');
                });
        });
    });

    describe('createPolicy', function() {
        it('should create the policy', function() {
            AWS.mock('IAM', 'createPolicy', Promise.resolve({
                Policy: {}
            }));

            return iamCalls.createPolicy("PolicyName", {})
                .then(policy => {
                    expect(policy).to.deep.equal({});
                    AWS.restore('IAM');
                });
        });
    });

    describe('deleteAllPolicyVersionsButProvided', function() {
        it('should delete all policy versions but the one provided', function() {
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
                    AWS.restore('IAM');
                });
        });
    });

    describe('attachPolicyToRole', function() {
        it('should attach the policy to the role', function() {
            AWS.mock('IAM', 'attachRolePolicy', Promise.resolve({}));

            return iamCalls.attachPolicyToRole('FakeArn', 'FakeRole')
                .then(response => {
                    expect(response).to.deep.equal({});
                    AWS.restore('IAM');
                });
        });
    });

    describe('createOrUpdatePolicy', function() {
        it('should create the policy when it doesnt exist', function() {
            sandbox.stub(iamCalls, 'getPolicy').returns(Promise.resolve(null));
            sandbox.stub(iamCalls, 'createPolicy').returns(Promise.resolve({}));

            return iamCalls.createOrUpdatePolicy('FakePolicy', 'FakeArn', {})
                .then(policy => {
                    expect(policy).to.deep.equal({})
                });
        });

        it('should update the policy when it exists', function() {
            sandbox.stub(iamCalls, 'getPolicy').returns(Promise.resolve({}));
            sandbox.stub(iamCalls, 'createPolicyVersion').returns(Promise.resolve({}));
            sandbox.stub(iamCalls, 'deleteAllPolicyVersionsButProvided').returns(Promise.resolve({}));

            return iamCalls.createOrUpdatePolicy('FakePolicy', 'FakeArn', {})
                .then(policy => {
                    expect(policy).to.deep.equal({})
                });
        });
    });

    describe('createPolicyIfNotExists', function() {
        it('should create the policy when it doesnt exist', function() {
            let getPolicyStub = sandbox.stub(iamCalls, 'getPolicy').returns(Promise.resolve(null));
            let createPolicyStub = sandbox.stub(iamCalls, 'createPolicy').returns(Promise.resolve({}));

            return iamCalls.createPolicyIfNotExists('FakePolicy', 'FakeArn', {})
                .then(policy => {
                    expect(policy).to.deep.equal({});
                    expect(getPolicyStub.calledOnce).to.be.true;
                    expect(createPolicyStub.calledOnce).to.be.true;
                });
        });

        it('should just return the policy when it exists', function() {
            let getPolicyStub = sandbox.stub(iamCalls, 'getPolicy').returns(Promise.resolve({}));
            let createPolicyStub = sandbox.stub(iamCalls, 'createPolicy').returns(Promise.resolve({}));

            return iamCalls.createPolicyIfNotExists('FakePolicy', 'FakeArn', {})
                .then(policy => {
                    expect(policy).to.deep.equal({});
                    expect(getPolicyStub.calledOnce).to.be.true;
                    expect(createPolicyStub.notCalled).to.be.true;
                });
        });
    });
});