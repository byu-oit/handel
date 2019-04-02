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
import { awsCalls } from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import * as defaultAccountConfig from '../../src/account-config/default-account-config';
import * as ec2Calls from '../../src/aws/ec2-calls';
import * as stsCalls from '../../src/aws/sts-calls';

describe('default account config module', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getDefaultAccountConfig', () => {
        it('should return the account config file for the default VPC', async () => {
            // Set up data to use
            const accountId = '111111111111';
            const region = 'us-east-1';
            const vpcId = 'vpc-ffffffff';
            const rdsSubnetGroupName = 'FakeRdsSubnetGroup';
            const elasticacheSubnetGroupName = 'FakeElasticacheSubnetGroup';
            const subnetIds = [
                'subnet-aaaaaaaaa',
                'subnet-bbbbbbbbb'
            ];

            // Stub out pieces this module calls
            const getRegionsStub = sandbox.stub(ec2Calls, 'getRegions').resolves([
                'us-east-1'
            ]);
            const getDefaultVpcStub = sandbox.stub(ec2Calls, 'getDefaultVpc').resolves({
                VpcId: vpcId
            });
            const getAccountIdStub = sandbox.stub(stsCalls, 'getAccountId').resolves(accountId);
            const getSubnetsStub = sandbox.stub(ec2Calls, 'getSubnets').resolves([
                {
                    SubnetId: subnetIds[0]
                },
                {
                    SubnetId: subnetIds[1]
                }
            ]);
            const getStackStub = sandbox.stub(awsCalls.cloudFormation, 'getStack').resolves(null);
            const createStackStub = sandbox.stub(awsCalls.cloudFormation, 'createStack').resolves({
                Outputs: [
                    {
                        OutputKey: 'RdsSubnetGroupName',
                        OutputValue: rdsSubnetGroupName
                    },
                    {
                        OutputKey: 'ElastiCacheSubnetGroupName',
                        OutputValue: elasticacheSubnetGroupName
                    }
                ]
            });

            // Invoke and return expectations
            const accountConfig = await defaultAccountConfig.getDefaultAccountConfig(region);
            expect(getRegionsStub.callCount).to.equal(1);
            expect(getDefaultVpcStub.callCount).to.equal(1);
            expect(getAccountIdStub.callCount).to.equal(1);
            expect(getStackStub.callCount).to.equal(1);
            expect(getSubnetsStub.callCount).to.equal(1);
            expect(createStackStub.callCount).to.equal(1);
            expect(accountConfig.account_id).to.equal(accountId);
            expect(accountConfig.region).to.equal(region);
            expect(accountConfig.vpc).to.equal(vpcId);
            expect(accountConfig.public_subnets).to.deep.equal(subnetIds);
            expect(accountConfig.private_subnets).to.deep.equal(subnetIds);
            expect(accountConfig.data_subnets).to.deep.equal(subnetIds);
            expect(accountConfig.rds_subnet_group).to.equal(rdsSubnetGroupName);
            expect(accountConfig.elasticache_subnet_group).to.equal(elasticacheSubnetGroupName);
        });

        it('should throw an error when an invalid region is provided', async () => {
            const region = 'SomeFakeRegion';

            const getRegionsStub = sandbox.stub(ec2Calls, 'getRegions').returns(Promise.resolve([
                'us-east-1'
            ]));

            try {
                const accountConfig = await defaultAccountConfig.getDefaultAccountConfig(region);
                expect(true).to.equal(false); // Should not get here
            }
            catch (err) {
                expect(getRegionsStub.callCount).to.equal(1);
            }
        });
    });
});
