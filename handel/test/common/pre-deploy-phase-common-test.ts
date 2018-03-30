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
import * as cloudformationCalls from '../../src/aws/cloudformation-calls';
import * as ec2Calls from '../../src/aws/ec2-calls';
import * as preDeployPhaseCommon from '../../src/common/pre-deploy-phase-common';
import { AccountConfig, PreDeployContext, ServiceConfig, ServiceContext } from '../../src/datatypes';
import FakeServiceRegistry from '../service-registry/fake-service-registry';

describe('PreDeploy Phase Common module', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<ServiceConfig>;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', {type: 'FakeType'}, accountConfig, new FakeServiceRegistry());
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('preDeployCreateSecurityGroup', () => {
        it('should create the security group when it doesnt exist', async () => {
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').resolves(null);
            const createStackStub = sandbox.stub(cloudformationCalls, 'createStack').resolves({
                Outputs: [{
                    OutputKey: 'GroupId',
                    OutputValue: 'SomeId'
                }]
            });
            const getSecurityGroupByIdStub = sandbox.stub(ec2Calls, 'getSecurityGroupById').resolves({});

            const preDeployContext = await preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, 22, 'FakeService');
            expect(preDeployContext).to.be.instanceOf(PreDeployContext);
            expect(preDeployContext.securityGroups.length).to.equal(1);
            expect(preDeployContext.securityGroups[0]).to.deep.equal({});
            expect(getStackStub.callCount).to.equal(1);
            expect(createStackStub.callCount).to.equal(1);
            expect(getSecurityGroupByIdStub.callCount).to.equal(1);
        });

        it('should update the security group when it exists', async () => {
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').resolves({});
            const updateStackStub = sandbox.stub(cloudformationCalls, 'updateStack').resolves({
                Outputs: [{
                    OutputKey: 'GroupId',
                    OutputValue: 'SomeId'
                }]
            });
            const getSecurityGroupByIdStub = sandbox.stub(ec2Calls, 'getSecurityGroupById').resolves({});

            const preDeployContext = await preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, 22, 'FakeService');
            expect(preDeployContext).to.be.instanceOf(PreDeployContext);
            expect(preDeployContext.securityGroups.length).to.equal(1);
            expect(preDeployContext.securityGroups[0]).to.deep.equal({});
            expect(getStackStub.callCount).to.equal(1);
            expect(updateStackStub.callCount).to.equal(1);
            expect(getSecurityGroupByIdStub.callCount).to.equal(1);
        });
    });
});
