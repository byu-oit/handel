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
import { expect } from 'chai';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as bindPhaseCommon from '../../../src/common/bind-phase-common';
import * as deletePhasesCommon from '../../../src/common/delete-phases-common';
import * as deployPhaseCommon from '../../../src/common/deploy-phase-common';
import * as preDeployPhaseCommon from '../../../src/common/pre-deploy-phase-common';
import { AccountConfig, BindContext, DeployContext, PreDeployContext, ServiceContext, UnBindContext, UnDeployContext, UnPreDeployContext } from '../../../src/datatypes';
import * as efs from '../../../src/services/efs';
import { EfsPerformanceMode, EfsServiceConfig } from '../../../src/services/efs/config-types';

describe('efs deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<EfsServiceConfig>;
    let serviceParams: EfsServiceConfig;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'efs'
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', 'efs', serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should require either max_io or general_purpose for the performance_mode parameter', () => {
            // No errors expected
            serviceContext.params.performance_mode = EfsPerformanceMode.GENERAL_PURPOSE;
            let errors = efs.check(serviceContext, []);
            expect(errors.length).to.equal(0);

            // No errors expected
            serviceContext.params.performance_mode = EfsPerformanceMode.MAX_IO;
            errors = efs.check(serviceContext, []);
            expect(errors.length).to.equal(0);
        });
    });

    describe('preDeploy', () => {
        it('should create a security group', async () => {
            const groupId = 'FakeSgGroupId';
            const preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push({
                GroupId: groupId
            });
            const createSgStub = sandbox.stub(preDeployPhaseCommon, 'preDeployCreateSecurityGroup').resolves(preDeployContext);

            const retContext = await efs.preDeploy(serviceContext);
            expect(retContext).to.be.instanceof(PreDeployContext);
            expect(retContext.securityGroups.length).to.equal(1);
            expect(retContext.securityGroups[0].GroupId).to.equal(groupId);
            expect(createSgStub.callCount).to.equal(1);
        });
    });

    describe('bind', () => {
        it('should add the source sg to its own sg as an ingress rule', async () => {
            const dependentOfServiceContext = new ServiceContext(appName, envName, 'FakeDependentService', 'ecs', { type: 'ecs' }, accountConfig);

            const bindSgStub = sandbox.stub(bindPhaseCommon, 'bindDependentSecurityGroupToSelf').resolves(new BindContext(serviceContext, dependentOfServiceContext));

            const bindContext = await efs.bind(serviceContext, new PreDeployContext(serviceContext), dependentOfServiceContext, new PreDeployContext(dependentOfServiceContext));
            expect(bindContext).to.be.instanceof(BindContext);
            expect(bindSgStub.callCount).to.equal(1);
        });
    });

    describe('deploy', () => {
        it('should deploy the file system', async () => {
            const ownPreDeployContext = new PreDeployContext(serviceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: 'FakeId'
            });
            const dependenciesDeployContexts: DeployContext[] = [];
            const fileSystemId = 'FakeFileSystemId';

            const deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').resolves({
                Outputs: [{
                    OutputKey: 'EFSFileSystemId',
                    OutputValue: fileSystemId
                }]
            });

            const deployContext = await efs.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
            expect(deployStackStub.callCount).to.equal(1);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.scripts.length).to.equal(1);
        });
    });

    describe('unPreDeploy', () => {
        it('should delete the security group', async () => {
            const unPreDeployStub = sandbox.stub(deletePhasesCommon, 'unPreDeploySecurityGroup').resolves(new UnPreDeployContext(serviceContext));

            const unPreDeployContext = await efs.unPreDeploy(serviceContext);
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployStub.callCount).to.equal(1);
        });
    });

    describe('unBind', () => {
        it('should unbind the security group', async () => {
            const unBindStub = sandbox.stub(deletePhasesCommon, 'unBindSecurityGroups').resolves(new UnBindContext(serviceContext));

            const unBindContext = await efs.unBind(serviceContext);
            expect(unBindContext).to.be.instanceof(UnBindContext);
            expect(unBindStub.callCount).to.equal(1);
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await efs.unDeploy(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);;
        });
    });
});
