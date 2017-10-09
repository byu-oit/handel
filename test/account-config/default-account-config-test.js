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
const defaultAccountConfig = require('../../lib/account-config/default-account-config');
const ec2Calls = require('../../lib/aws/ec2-calls');
const cloudformationCalls = require('../../lib/aws/cloudformation-calls');
const stsCalls = require('../../lib/aws/sts-calls');
const sinon = require('sinon');

describe('default account config module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('getDefaultAccountConfig', function () {
        it('should return the account config file for the default VPC', function () {
            //Set up data to use
            let accountId = 111111111111;
            let region = "us-east-1";
            let vpcId = "vpc-ffffffff";
            let rdsSubnetGroupName = "FakeRdsSubnetGroup";
            let elasticacheSubnetGroupName = "FakeElasticacheSubnetGroup";
            let subnetIds = [
                'subnet-aaaaaaaaa',
                'subnet-bbbbbbbbb'
            ]

            //Stub out pieces this module calls
            let getRegionsStub = sandbox.stub(ec2Calls, 'getRegions').returns(Promise.resolve([
                'us-east-1'
            ]))
            let getDefaultVpcStub = sandbox.stub(ec2Calls, 'getDefaultVpc').returns(Promise.resolve({
                VpcId: vpcId
            }));
            let getAccountIdStub = sandbox.stub(stsCalls, 'getAccountId').returns(Promise.resolve(accountId));
            let getSubnetsStub = sandbox.stub(ec2Calls, 'getSubnets').returns(Promise.resolve([
                {
                    SubnetId: subnetIds[0]
                },
                {
                    SubnetId: subnetIds[1]
                }
            ]));
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudformationCalls, 'createStack').returns(Promise.resolve({
                Outputs: [
                    {
                        OutputKey: 'RdsSubnetGroupName',
                        OutputValue: rdsSubnetGroupName
                    },
                    {
                        OutputKey: "ElastiCacheSubnetGroupName",
                        OutputValue: elasticacheSubnetGroupName
                    }
                ]
            }))

            //Invoke and return expectations
            return defaultAccountConfig.getDefaultAccountConfig(`default-${region}`)
                .then(accountConfig => {
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
        });

        it('should throw an error when an invalid region is provided', function () {
            let region = "SomeFakeRegion";

            let getRegionsStub = sandbox.stub(ec2Calls, 'getRegions').returns(Promise.resolve([
                'us-east-1'
            ]));

            return defaultAccountConfig.getDefaultAccountConfig(`default-${region}`)
                .then(accountConfig => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(getRegionsStub.callCount).to.equal(1);
                });
        });
    });
});