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
import * as s3Calls from '../../src/aws/s3-calls';
import * as deletePhasesCommon from '../../src/common/delete-phases-common';
import { AccountConfig, ServiceConfig, ServiceContext, UnBindContext, UnDeployContext, UnPreDeployContext } from '../../src/datatypes';
import FakeServiceRegistry from '../service-registry/fake-service-registry';

describe('Delete phases common module', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<ServiceConfig>;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        const retAccountConfig = await config(`${__dirname}/../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'dynamodb', {type: 'dynamodb'}, retAccountConfig);
        accountConfig = retAccountConfig;
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('unDeployService', () => {
        it('should delete the stack if it exists', async () => {
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            const deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').returns(Promise.resolve(true));
            const deleteMatchingPrefix = sandbox.stub(s3Calls, 'deleteMatchingPrefix').returns(Promise.resolve(true));

            const unDeployContext = await deletePhasesCommon.unDeployService(serviceContext, 'DynamoDB');
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(getStackStub.callCount).to.equal(1);
            expect(deleteStackStub.callCount).to.equal(1);
            expect(deleteMatchingPrefix.callCount).to.equal(1);
        });

        it('should suceed even if the stack has been deleted', async () => {
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            const deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').returns(Promise.resolve(true));
            const deleteMatchingPrefix = sandbox.stub(s3Calls, 'deleteMatchingPrefix').returns(Promise.resolve(true));

            const unDeployContext = await deletePhasesCommon.unDeployService(serviceContext, 'DynamoDB');
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(getStackStub.callCount).to.equal(1);
            expect(deleteStackStub.callCount).to.equal(0);
            expect(deleteMatchingPrefix.callCount).to.equal(1);
        });
    });

    describe('unPreDeploySecurityGroup', () => {
        it('should delete the stack if it exists', async () => {
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            const deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').returns(Promise.resolve(true));

            const unPreDeployContext = await deletePhasesCommon.unPreDeploySecurityGroup(serviceContext, 'FakeService');
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(getStackStub.callCount).to.equal(1);
            expect(deleteStackStub.callCount).to.equal(1);
        });

        it('should return true if the stack is already deleted', async () => {
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            const deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').returns(Promise.resolve(true));

            const unPreDeployContext = await deletePhasesCommon.unPreDeploySecurityGroup(serviceContext, 'FakeService');
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(getStackStub.callCount).to.equal(1);
            expect(deleteStackStub.callCount).to.equal(0);
        });
    });

    describe('unBindSecurityGroups', () => {
        it('should remove all ingress from the given security group', async () => {
            const removeIngressStub = sandbox.stub(ec2Calls, 'removeAllIngressFromSg').returns(Promise.resolve({}));

            const unBindContext = await deletePhasesCommon.unBindSecurityGroups(serviceContext, 'FakeService');
            expect(unBindContext).to.be.instanceof(UnBindContext);
            expect(removeIngressStub.callCount).to.equal(1);
        });
    });
});
