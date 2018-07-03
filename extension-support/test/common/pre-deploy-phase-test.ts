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
import { PreDeployContext, ServiceConfig, ServiceContext, ServiceType } from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import * as cloudformationCalls from '../../src/aws/cloudformation-calls';
import * as ec2Calls from '../../src/aws/ec2-calls';
import * as deployPhase from '../../src/common/deploy-phase';
import * as preDeployPhase from '../../src/common/pre-deploy-phase';
import accountConfig from '../fake-account-config';

describe('PreDeploy Phase Common module', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<ServiceConfig>;

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType('someExtension', 'FakeType'), {type: 'FakeType'}, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('preDeployCreateSecurityGroup', () => {
        it('should create the security group when it doesnt exist', async () => {
            const uploadTemplateStub = sandbox.stub(deployPhase, 'uploadCFTemplateToHandelBucket').resolves({
                Location: 's3://fakelocation'
            });
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').resolves(null);
            const createStackStub = sandbox.stub(cloudformationCalls, 'createStack').resolves({
                Outputs: [{
                    OutputKey: 'GroupId',
                    OutputValue: 'SomeId'
                }]
            });
            const getSecurityGroupByIdStub = sandbox.stub(ec2Calls, 'getSecurityGroupById').resolves({});

            const preDeployContext = await preDeployPhase.preDeployCreateSecurityGroup(serviceContext, 22, 'FakeService');
            expect(preDeployContext).to.be.instanceOf(PreDeployContext);
            expect(preDeployContext.securityGroups.length).to.equal(1);
            expect(preDeployContext.securityGroups[0]).to.deep.equal({});
            expect(uploadTemplateStub.callCount).to.equal(1);
            expect(getStackStub.callCount).to.equal(1);
            expect(createStackStub.callCount).to.equal(1);
            expect(getSecurityGroupByIdStub.callCount).to.equal(1);
        });

        it('should update the security group when it exists', async () => {
            const uploadTemplateStub = sandbox.stub(deployPhase, 'uploadCFTemplateToHandelBucket').resolves({
                Location: 's3://fakelocation'
            });
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').resolves({});
            const updateStackStub = sandbox.stub(cloudformationCalls, 'updateStack').resolves({
                Outputs: [{
                    OutputKey: 'GroupId',
                    OutputValue: 'SomeId'
                }]
            });
            const getSecurityGroupByIdStub = sandbox.stub(ec2Calls, 'getSecurityGroupById').resolves({});

            const preDeployContext = await preDeployPhase.preDeployCreateSecurityGroup(serviceContext, 22, 'FakeService');
            expect(preDeployContext).to.be.instanceOf(PreDeployContext);
            expect(preDeployContext.securityGroups.length).to.equal(1);
            expect(preDeployContext.securityGroups[0]).to.deep.equal({});
            expect(uploadTemplateStub.callCount).to.equal(1);
            expect(getStackStub.callCount).to.equal(1);
            expect(updateStackStub.callCount).to.equal(1);
            expect(getSecurityGroupByIdStub.callCount).to.equal(1);
        });
    });
});
