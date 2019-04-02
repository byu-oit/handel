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
import {
    PreDeployContext,
    ServiceConfig,
    ServiceContext,
    ServiceType,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import * as cloudformationCalls from '../../src/aws/cloudformation-calls';
import * as ec2Calls from '../../src/aws/ec2-calls';
import * as s3Calls from '../../src/aws/s3-calls';
import * as ssmCalls from '../../src/aws/ssm-calls';
import * as deletePhases from '../../src/common/delete-phases';
import accountConfig from '../fake-account-config';

describe('Delete phases common module', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<ServiceConfig>;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';

    beforeEach(async () => {
        sandbox = sinon.createSandbox();
        serviceContext = new ServiceContext(appName, envName, 'FakeService',
            new ServiceType('someExtension', 'dynamodb'), {type: 'dynamodb'}, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('unDeployService', () => {
        it('should delete the stack if it exists', async () => {
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').resolves({});
            const deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').resolves(true);
            const deleteMatchingPrefix = sandbox.stub(s3Calls, 'deleteMatchingPrefix').resolves(true);

            const unDeployContext = await deletePhases.unDeployService(serviceContext, 'DynamoDB');
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(getStackStub.callCount).to.equal(1);
            expect(deleteStackStub.callCount).to.equal(1);
            expect(deleteMatchingPrefix.callCount).to.equal(1);
        });

        it('should suceed even if the stack has been deleted', async () => {
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').resolves(null);
            const deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').resolves(true);
            const deleteMatchingPrefix = sandbox.stub(s3Calls, 'deleteMatchingPrefix').resolves(true);

            const unDeployContext = await deletePhases.unDeployService(serviceContext, 'DynamoDB');
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(getStackStub.callCount).to.equal(1);
            expect(deleteStackStub.callCount).to.equal(0);
            expect(deleteMatchingPrefix.callCount).to.equal(1);
        });
    });

    describe('unPreDeploySecurityGroup', () => {
        it('should delete the stack if it exists', async () => {
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').resolves({});
            const deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').resolves(true);

            const unPreDeployContext = await deletePhases.unPreDeploySecurityGroup(serviceContext, 'FakeService');
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(getStackStub.callCount).to.equal(1);
            expect(deleteStackStub.callCount).to.equal(1);
        });

        it('should return true if the stack is already deleted', async () => {
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').resolves(null);
            const deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').resolves(true);

            const unPreDeployContext = await deletePhases.unPreDeploySecurityGroup(serviceContext, 'FakeService');
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(getStackStub.callCount).to.equal(1);
            expect(deleteStackStub.callCount).to.equal(0);
        });
    });

    describe('unBindService', () => {
        it('should remove the ingress rule from the given security group', async () => {
            const ownPreDeployContext = new PreDeployContext(serviceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: 'FakeId'
            });
            const dependentOfServiceContext = new ServiceContext(appName, envName, 'FakeDependentOfService',
                new ServiceType('extensionPrefix', 'ecs'), {type: 'ecs'}, accountConfig);
            const dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);
            dependentOfPreDeployContext.securityGroups.push({
                GroupId: 'OtherId'
            });

            const removeIngressStub = sandbox.stub(ec2Calls, 'removeIngressFromSg').resolves({});

            const unBindContext = await deletePhases.unBindService(serviceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, 'tcp', 3306);
            expect(unBindContext).to.be.instanceof(UnBindContext);
            expect(removeIngressStub.callCount).to.equal(1);
        });

        it('should return successfully if there are no security groups to unbind from (idempotency)', async () => {
            const ownPreDeployContext = new PreDeployContext(serviceContext);
            const dependentOfServiceContext = new ServiceContext(appName, envName, 'FakeDependentOfService',
                new ServiceType('extensionPrefix', 'ecs'), {type: 'ecs'}, accountConfig);
            const dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);

            const unBindContext = await deletePhases.unBindService(serviceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, 'tcp', 3306);
            expect(unBindContext).to.be.instanceof(UnBindContext);
        });
    });

    describe('deleteParametersFromParameterStore', () => {
        it('should delete the RDS parameters from the parameter store', async () => {
            const deleteParamsStub = sandbox.stub(ssmCalls, 'deleteParameters').resolves(true);
            const response = await deletePhases.deleteServiceItemsFromSSMParameterStore(serviceContext, ['db_username', 'db_password']);
            expect(response).to.deep.equal(true);
            expect(deleteParamsStub.callCount).to.equal(1);
        });
    });
});
