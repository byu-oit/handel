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
const ec2Calls = require('../../lib/aws/ec2-calls');
const sinon = require('sinon');


describe('ec2-calls', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
        AWS.restore('EC2');
    });

    describe('getSecurityGroup', function () {
        it('should return the security group when found', function () {
            let groupName = "FakeGroup";
            let vpcId = "vpc-11111111";
            AWS.mock('EC2', 'describeSecurityGroups', Promise.resolve({
                SecurityGroups: [
                    {
                        GroupName: groupName
                    }
                ]
            }));

            return ec2Calls.getSecurityGroup(groupName, vpcId)
                .then(sg => {
                    expect(sg).to.not.be.null;
                    expect(sg.GroupName).to.equal(groupName);
                });
        });

        it('should return null when the security group is not found', function () {
            let groupName = "FakeGroup";
            let vpcId = "vpc-11111111";
            AWS.mock('EC2', 'describeSecurityGroups', Promise.resolve({
                SecurityGroups: []
            }));

            return ec2Calls.getSecurityGroup(groupName, vpcId)
                .then(sg => {
                    expect(sg).to.be.null;
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

    describe('removeAllIngressFromSg', function () {
        it('should revoke all ingreess on the security group', function () {
            let getSecurityGroupStub = sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve({
                GroupId: 'FakeId',
                IpPermissions: [{
                    IpProtocol: 'tcp',
                    FromPort: 0,
                    ToPort: 1024,
                    UserIdGroupPairs: []
                }]
            }));
            AWS.mock('EC2', 'revokeSecurityGroupIngress', Promise.resolve({}));

            return ec2Calls.removeAllIngressFromSg("FakeGroup")
                .then(success => {
                    expect(success).to.be.true;
                    expect(getSecurityGroupStub.calledOnce).to.be.true;
                });
        });

        it('should return true if the security group has already been deleted', function () {
            let getSecurityGroupStub = sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve(null));

            return ec2Calls.removeAllIngressFromSg("FakeGroup")
                .then(success => {
                    expect(success).to.be.true;
                    expect(getSecurityGroupStub.calledOnce).to.be.true;
                });
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
                });
        });
    });
});