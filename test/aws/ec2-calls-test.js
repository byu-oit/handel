const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const ec2Calls = require('../../lib/aws/ec2-calls');
const sinon = require('sinon');


describe('ec2-calls', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('createSecurityGroupIfNotExists', function () {
        it('should create and return the security group if none exists', function () {
            let groupName = 'FakeGroup';
            sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve(null));
            sandbox.stub(ec2Calls, 'createSecurityGroup').returns(Promise.resolve({
                GroupName: groupName
            }));

            return ec2Calls.createSecurityGroupIfNotExists(groupName, 'FakeVpc')
                .then(securityGroup => {
                    expect(securityGroup.GroupName).to.equal(groupName);
                });
        });

        it('should return the security group if already exists', function () {
            let groupName = 'FakeGroup';
            sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve({
                GroupName: groupName
            }));

            return ec2Calls.createSecurityGroupIfNotExists(groupName, 'FakeVpc')
                .then(securityGroup => {
                    expect(securityGroup.GroupName).to.equal(groupName);
                })
        });
    });

    describe('createSecurityGroup', function () {
        it('should create and return the security group', function () {
            let groupName = "FakeGroup";
            sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve({
                GroupName: groupName
            }));
            sandbox.stub(ec2Calls, 'tagResource').returns(Promise.resolve({}));
            AWS.mock('EC2', 'createSecurityGroup', Promise.resolve({
                GroupName: groupName
            }));

            return ec2Calls.createSecurityGroup(groupName, 'FakeVpc')
                .then(securityGroup => {
                    expect(securityGroup.GroupName).to.equal(groupName);
                    AWS.restore('EC2', 'createSecurityGroup');
                });
        });
    });

    describe('getSecurityGroup', function () {
        it('should return the security group if found', function () {
            let groupName = "FakeGroup";
            AWS.mock('EC2', 'describeSecurityGroups', Promise.resolve({
                SecurityGroups: [{ GroupName: groupName }]
            }));

            return ec2Calls.getSecurityGroup(groupName, 'FakeVpc')
                .then(securityGroup => {
                    expect(securityGroup.GroupName).to.equal(groupName);
                    AWS.restore('EC2', 'describeSecurityGroups');
                });
        });

        it('should return null if no group found', function () {
            let groupName = "FakeGroup";
            AWS.mock('EC2', 'describeSecurityGroups', Promise.resolve({
                SecurityGroups: []
            }));

            return ec2Calls.getSecurityGroup(groupName, 'FakeVpc')
                .then(securityGroup => {
                    expect(securityGroup).to.be.null;
                    AWS.restore('EC2', 'describeSecurityGroups');
                });
        });
    });

    describe('tagResource', function () {
        it('should call createTags', function () {
            AWS.mock('EC2', 'createTags', Promise.resolve({}));

            return ec2Calls.tagResource("FakeResource", [])
                .then(response => {
                    expect(response).to.deep.equal({});
                    AWS.restore('EC2', 'createTags');
                });
        });
    });

    describe('ingressRuleExists', function () {
        it('should return true when the rule exists', function () {
            let sourceSg = {
                GroupId: 'SourceSg'
            }
            let destSg = {
                GroupId: 'DestSg',
                IpPermissions: [{
                    FromPort: 0,
                    ToPort: 65535,
                    IpProtocol: 'tcp',
                    UserIdGroupPairs: [{
                        GroupId: 'SourceSg'
                    }]
                }]
            }
            let exists = ec2Calls.ingressRuleExists(destSg, 0, 65535, 'tcp', sourceSg);
            expect(exists).to.equal(true);
        });

        it('should return false when no rule exists', function () {
            let sourceSg = {
                GroupId: 'SourceSg'
            }
            let destSg = {
                GroupId: 'DestSg',
                IpPermissions: [{
                    FromPort: 0,
                    ToPort: 65535,
                    IpProtocol: 'tcp',
                    UserIdGroupPairs: [{
                        GroupId: 'OtherSg'
                    }]
                }]
            }
            let exists = ec2Calls.ingressRuleExists(destSg, 0, 65535, 'tcp', sourceSg);
            expect(exists).to.equal(false);
        });
    });

    describe('addIngressRuleToSgIfNotExists', function () {
        it('should add the ingress rule when it doesnt exist', function () {
            let sourceSg = {
                GroupId: 'SourceSg'
            }
            let destSg = {
                GroupId: 'DestSg',
                IpPermissions: [{
                    FromPort: 0,
                    ToPort: 65535,
                    IpProtocol: 'tcp',
                    UserIdGroupPairs: [{
                        GroupId: 'OtherSg'
                    }]
                }]
            }
            sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve(destSg));
            sandbox.stub(ec2Calls, 'addIngressRuleToSecurityGroup').returns(Promise.resolve({}));

            return ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, destSg, 'tcp', 0, 65535, 'FakeVpc')
                .then(securityGroup => {
                    expect(securityGroup).to.deep.equal({});
                });
        });

        it('should just return the security group if the rule already exists', function () {
            let sourceSg = {
                GroupId: 'SourceSg'
            }
            let destSg = {
                GroupId: 'DestSg',
                IpPermissions: [{
                    FromPort: 0,
                    ToPort: 65535,
                    IpProtocol: 'tcp',
                    UserIdGroupPairs: [{
                        GroupId: 'SourceSg'
                    }]
                }]
            }
            sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve(destSg));
            sandbox.stub(ec2Calls, 'addIngressRuleToSecurityGroup').returns(Promise.resolve({}));

            return ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, destSg, 'tcp', 0, 65535, 'FakeVpc')
                .then(securityGroup => {
                    expect(securityGroup).to.deep.equal(destSg);
                });
        });

        it('should throw an error if the dest security group doesnt exist', function () {
            sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve(null));

            return ec2Calls.addIngressRuleToSgIfNotExists({}, {}, 'tcp', 0, 65535, 'FakeVpc')
                .then(() => {
                    expect(true).to.equal(false); //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.include("missing security group");
                })
        });
    });

    describe('addIngressRuleToSecurityGroup', function () {
        it('should authorize the ingress rule and return the security group', function () {
            let groupName = "FakeGroup";
            AWS.mock('EC2', 'authorizeSecurityGroupIngress', Promise.resolve({}));
            sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve({
                GroupName: groupName
            }));

            return ec2Calls.addIngressRuleToSecurityGroup({}, {}, 'tcp', 0, 65335, 'FakeVpc')
                .then(securityGroup => {
                    console.log(securityGroup);
                    expect(securityGroup.GroupName).to.equal(groupName);
                    AWS.restore('EC2', 'authorizeSecurityGroupIngress');
                });
        });
    });
});