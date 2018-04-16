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
    AccountConfig,
    DeployContext,
    PreDeployContext,
    ServiceContext,
    ServiceType,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as cloudformationCalls from '../../../src/aws/cloudformation-calls';
import * as ec2Calls from '../../../src/aws/ec2-calls';
import * as deletePhasesCommon from '../../../src/common/delete-phases-common';
import * as deployPhaseCommon from '../../../src/common/deploy-phase-common';
import * as preDeployPhaseCommon from '../../../src/common/pre-deploy-phase-common';
import * as codedeploy from '../../../src/services/codedeploy';
import * as alb from '../../../src/services/codedeploy/alb';
import * as asgLaunchConfig from '../../../src/services/codedeploy/asg-launchconfig';
import { CodeDeployServiceConfig } from '../../../src/services/codedeploy/config-types';
import * as deployableArtifact from '../../../src/services/codedeploy/deployable-artifact';
import * as iamRoles from '../../../src/services/codedeploy/iam-roles';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('codedeploy deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<CodeDeployServiceConfig>;
    let serviceParams: CodeDeployServiceConfig;
    let accountConfig: AccountConfig;
    const app = `FakeApp`;
    const env = `FakeEnv`;
    const service = 'FakeService';

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        serviceParams = {
            type: 'codedeploy',
            path_to_code: '.',
            os: 'linux'
        };
        serviceContext = new ServiceContext(app, env, service, new ServiceType(STDLIB_PREFIX, 'codedeploy'), serviceParams, accountConfig);
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it(`should do nothing yet`, () => {
            const errors = codedeploy.check(serviceContext);
            expect(errors).to.deep.equal([]);
        });
    });

    describe('preDeploy', () => {
        it('should call the predeploy common to create a security group', async () => {
            const groupId = 'FakeSgGroupId';
            const preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push({
                GroupId: groupId
            });
            const preDeployCreateSgStub = sandbox.stub(preDeployPhaseCommon, 'preDeployCreateSecurityGroup').resolves(preDeployContext);

            const retContext = await codedeploy.preDeploy(serviceContext);
            expect(retContext).to.be.instanceof(PreDeployContext);
            expect(retContext.securityGroups.length).to.equal(1);
            expect(retContext.securityGroups[0].GroupId).to.equal(groupId);
            expect(preDeployCreateSgStub.callCount).to.equal(1);
        });
    });

    describe('deploy', () => {
        it(`should deploy the codedeploy service`, async () => {
            const preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups = [{
                GroupId: 'FakeGroupId'
            }];
            const dependenciesDeployContexts: DeployContext[] = [];

            const createRoleStub = sandbox.stub(iamRoles, 'createCodeDeployServiceRoleIfNotExists').resolves({
                Arn: 'MyFakeArn'
            });
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').resolves({});
            const shouldRollInstancesStub = sandbox.stub(asgLaunchConfig, 'shouldRollInstances').resolves(true);
            const getUserDataStub = sandbox.stub(asgLaunchConfig, 'getUserDataScript').resolves('FakeScript');
            const uploadArtifactStub = sandbox.stub(deployableArtifact, 'prepareAndUploadDeployableArtifactToS3').resolves({
                Bucket: 'FakeBucket',
                Key: 'FakeKey'
            });
            const getAmiStub = sandbox.stub(asgLaunchConfig, 'getCodeDeployAmi').resolves({
                ImageId: 'FakeAmiId'
            });
            const getInstanceRoleStatementsStub = sandbox.stub(iamRoles, 'getStatementsForInstanceRole').resolves([]);
            const getRoutingStub = sandbox.stub(alb, 'getRoutingConfig').resolves({});
            const assignPublicIpStub = sandbox.stub(ec2Calls, 'shouldAssignPublicIp').resolves(true);
            const deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').resolves({});
            const rollInstancesStub = sandbox.stub(asgLaunchConfig, 'rollInstances').resolves();

            const deployContext = await codedeploy.deploy(serviceContext, preDeployContext, dependenciesDeployContexts);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(createRoleStub.callCount).to.equal(1);
            expect(getStackStub.callCount).to.equal(1);
            expect(shouldRollInstancesStub.callCount).to.equal(1);
            expect(getUserDataStub.callCount).to.equal(1);
            expect(uploadArtifactStub.callCount).to.equal(1);
            expect(getAmiStub.callCount).to.equal(1);
            expect(getInstanceRoleStatementsStub.callCount).to.equal(1);
            expect(getRoutingStub.callCount).to.equal(1);
            expect(assignPublicIpStub.callCount).to.equal(1);
            expect(deployStackStub.callCount).to.equal(1);
            expect(rollInstancesStub.callCount).to.equal(1);
        });
    });

    describe('unPreDeploy', () => {
        it('should delete the security group', async () => {
            const unPreDeployStub = sandbox.stub(deletePhasesCommon, 'unPreDeploySecurityGroup').resolves(new UnPreDeployContext(serviceContext));

            const unPreDeployContext = await codedeploy.unPreDeploy(serviceContext);
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployStub.callCount).to.equal(1);
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await codedeploy.unDeploy(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
