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
import * as ec2Calls from '../../src/aws/ec2-calls';

describe('ec2-calls', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getSecurityGroup', () => {
        it('should return the security group when found', async () => {
            const groupName = 'FakeGroup';
            const describeSecurityGroupsStub = sandbox.stub(awsWrapper.ec2, 'describeSecurityGroups').resolves({
                SecurityGroups: [
                    {
                        GroupName: groupName
                    }
                ]
            });

            const sg = await ec2Calls.getSecurityGroup(groupName, 'vpc-11111111');
            expect(describeSecurityGroupsStub.callCount).to.equal(1);
            expect(sg).to.not.equal(null);
            expect(sg!.GroupName).to.equal(groupName);
        });

        it('should return null when the security group is not found', async () => {
            const groupName = 'FakeGroup';
            const describeSecurityGroupsStub = sandbox.stub(awsWrapper.ec2, 'describeSecurityGroups').resolves({
                SecurityGroups: []
            });

            const sg = await ec2Calls.getSecurityGroup(groupName, 'vpc-11111111');
            expect(sg).to.equal(null);
        });
    });

    describe('ingressRuleExists', () => {
        const sourceSg = {
            GroupId: 'SourceSg'
        };
        const destSg = {
            GroupId: 'DestSg',
            IpPermissions: [{
                FromPort: 0,
                ToPort: 65535,
                IpProtocol: 'tcp',
                UserIdGroupPairs: [{
                    GroupId: 'SourceSg'
                }]
            }]
        };

        it('should return true when the rule exists', () => {
            const exists = ec2Calls.ingressRuleExists(destSg, 0, 65535, 'tcp', sourceSg);
            expect(exists).to.equal(true);
        });

        it('should return false when no rule exists', () => {
            const otherSourceSg = {
                GroupId: 'OtherSg'
            };
            const exists = ec2Calls.ingressRuleExists(destSg, 0, 65535, 'tcp', otherSourceSg);
            expect(exists).to.equal(false);
        });
    });

    describe('removeAllIngressFromSg', () => {
        it('should revoke all ingreess on the security group', async () => {
            const describeSecurityGroupsStub = sandbox.stub(awsWrapper.ec2, 'describeSecurityGroups').resolves({
                SecurityGroups: [{
                    GroupId: 'FakeId',
                    IpPermissions: [{
                        IpProtocol: 'tcp',
                        FromPort: 0,
                        ToPort: 1024,
                        UserIdGroupPairs: []
                    }]
                }]
            });
            const revokeIngressStub = sandbox.stub(awsWrapper.ec2, 'revokeSecurityGroupIngress').resolves({});

            const success = await ec2Calls.removeAllIngressFromSg('FakeGroup', 'FakeVpcId');
            expect(success).to.equal(true);
            expect(describeSecurityGroupsStub.callCount).to.equal(1);
            expect(revokeIngressStub.callCount).to.equal(1);
        });

        it('should return true if the security group has already been deleted', async () => {
            const describeSecurityGroupsStub = sandbox.stub(awsWrapper.ec2, 'describeSecurityGroups').resolves({
                SecurityGroups: []
            });

            const success = await ec2Calls.removeAllIngressFromSg('FakeGroup', 'FakeVpc');
            expect(success).to.equal(true);
            expect(describeSecurityGroupsStub.callCount).to.equal(1);
        });
    });

    describe('addIngressRuleToSgIfNotExists', () => {
        const sourceSg = {
            GroupId: 'SourceSg'
        };
        const destSg = {
            GroupId: 'DestSg',
            IpPermissions: [{
                FromPort: 0,
                ToPort: 65535,
                IpProtocol: 'tcp',
                UserIdGroupPairs: [{
                    GroupId: 'SourceSg'
                }]
            }]
        };

        it('should add the ingress rule when it doesnt exist', async () => {
            const otherSourceSg = {
                GroupId: 'OtherSourceSg'
            };
            const describeSecurityGroupsStub = sandbox.stub(awsWrapper.ec2, 'describeSecurityGroups').resolves({
                SecurityGroups: [destSg]
            });
            const addIngressStub = sandbox.stub(awsWrapper.ec2, 'authorizeSecurityGroupIngress').resolves({});

            const securityGroup = await ec2Calls.addIngressRuleToSgIfNotExists(otherSourceSg, destSg, 'tcp', 0, 65535, 'FakeVpc');
            expect(securityGroup).to.deep.equal(destSg);
            expect(describeSecurityGroupsStub.callCount).to.equal(2);
            expect(addIngressStub.callCount).to.equal(1);
        });

        it('should just return the security group if the rule already exists', async () => {
            const describeSecurityGroupsStub = sandbox.stub(awsWrapper.ec2, 'describeSecurityGroups').resolves({
                SecurityGroups: [destSg]
            });
            const addIngressStub = sandbox.stub(awsWrapper.ec2, 'authorizeSecurityGroupIngress').resolves({});

            const securityGroup = await ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, destSg, 'tcp', 0, 65535, 'FakeVpc');
            expect(securityGroup).to.deep.equal(destSg);
            expect(describeSecurityGroupsStub.callCount).to.equal(1);
            expect(addIngressStub.callCount).to.equal(0);
        });

        it('should throw an error if the dest security group doesnt exist', async () => {
            const describeSecurityGroupsStub = sandbox.stub(awsWrapper.ec2, 'describeSecurityGroups').resolves({
                SecurityGroups: []
            });

            try {
                await ec2Calls.addIngressRuleToSgIfNotExists({}, {}, 'tcp', 0, 65535, 'FakeVpc');
                expect(true).to.equal(false); // Should not get here
            }
            catch (err) {
                expect(err.message).to.include('missing security group');
                expect(describeSecurityGroupsStub.callCount).to.equal(1);
            }
        });
    });

    describe('addIngressRuleToSecurityGroup', () => {
        it('should authorize the ingress rule and return the security group', async () => {
            const groupName = 'FakeGroup';
            const authorizeIngressStub = sandbox.stub(awsWrapper.ec2, 'authorizeSecurityGroupIngress').resolves({});
            const describeSecurityGroupsStub = sandbox.stub(awsWrapper.ec2, 'describeSecurityGroups').resolves({
                SecurityGroups: [{
                    GroupName: groupName
                }]
            });

            const securityGroup = await ec2Calls.addIngressRuleToSecurityGroup({}, {}, 'tcp', 0, 65335, 'FakeVpc');
            expect(securityGroup).to.not.equal(null);
            expect(securityGroup!.GroupName).to.equal(groupName);
            expect(authorizeIngressStub.callCount).to.equal(1);
            expect(describeSecurityGroupsStub.callCount).to.equal(1);
        });
    });

    describe('getLatestAmiByName', () => {
        it('should return the latest AMI from a list of AMIs with the given name substring', async () => {
            const latestCreationDate = '2017-01-27T19:23:17.000Z';
            const describeImagesStub = sandbox.stub(awsWrapper.ec2, 'describeImages').resolves({
                Images: [
                    {
                        CreationDate: '2016-01-27T19:23:17.000Z'
                    },
                    {
                        CreationDate: latestCreationDate
                    }
                ]
            });

            const ami = await ec2Calls.getLatestAmiByName('amazon', 'some-ami-name');
            expect(ami).to.not.equal(null);
            expect(ami!.CreationDate).to.equal(latestCreationDate);
            expect(describeImagesStub.callCount).to.equal(1);
        });

        it('should return null if there are no results', async () => {
            const describeImagesStub = sandbox.stub(awsWrapper.ec2, 'describeImages').resolves({
                Images: []
            });

            const ami = await ec2Calls.getLatestAmiByName('amazon', 'some-ami-name');
            expect(ami).to.equal(null);
            expect(describeImagesStub.callCount).to.equal(1);
        });
    });

    describe('getSubnet', () => {
        it('should return the subnet when it exists', async () => {
            const describeSubnetsStub = sandbox.stub(awsWrapper.ec2, 'describeSubnets').resolves({
                Subnets: [{}]
            });

            const subnet = await ec2Calls.getSubnet('FakeSubnetId');
            expect(subnet).to.deep.equal({});
            expect(describeSubnetsStub.callCount).to.equal(1);
        });

        it('should return null if the subnet doesnt exist', async () => {
            const describeSubnetsStub = sandbox.stub(awsWrapper.ec2, 'describeSubnets').resolves({});

            const subnet = await ec2Calls.getSubnet('FakeSubnetId');
            expect(subnet).to.equal(null);
            expect(describeSubnetsStub.callCount).to.equal(1);
        });

        it('should return null if the describe response comes back empty for some reason', async () => {
            const describeSubnetsStub = sandbox.stub(awsWrapper.ec2, 'describeSubnets').rejects({
                code: 'InvalidSubnetID.NotFound'
            });

            const subnet = await ec2Calls.getSubnet('FakeSubnetId');
            expect(subnet).to.equal(null);
            expect(describeSubnetsStub.callCount).to.equal(1);
        });

        it('should rethrow any other erorr', async () => {
            const describeSubnetsStub = sandbox.stub(awsWrapper.ec2, 'describeSubnets').rejects({
                code: 'OtherError'
            });

            try {
                const subnet = await ec2Calls.getSubnet('FakeSubnetId');
                expect(true).to.equal(false); // Should not get here
            }
            catch (err) {
                expect(describeSubnetsStub.callCount).to.equal(1);
            }
        });
    });
});
