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
    BindContext,
    DeployContext,
    PreDeployContext,
    ServiceContext,
    ServiceDeployer,
    ServiceType,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import { awsCalls, bindPhase, deletePhases, preDeployPhase } from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import { Service } from '../../../src/services/neptune';
import { NeptuneConfig } from '../../../src/services/neptune/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('neptune deployer', () => {
    let sandbox: sinon.SinonSandbox;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    let serviceContext: ServiceContext<NeptuneConfig>;
    let serviceParams: NeptuneConfig;
    let accountConfig: AccountConfig;
    let neptune: ServiceDeployer;

    beforeEach(async () => {
        neptune = new Service();
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'neptune'
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'neptune'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    // At the moment, check only validates the JSON schema, so no tests here for that phase at the moment

    describe('preDeploy', () => {
        it('should create a security group', async () => {
            const groupId = 'FakeSgGroupId';
            const preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push({
                GroupId: groupId
            });
            const createSgStub = sandbox.stub(preDeployPhase, 'preDeployCreateSecurityGroup')
                .resolves(preDeployContext);

            const retPreDeployContext = await neptune.preDeploy!(serviceContext);
            expect(retPreDeployContext).to.be.instanceof(PreDeployContext);
            expect(retPreDeployContext.securityGroups.length).to.equal(1);
            expect(retPreDeployContext.securityGroups[0].GroupId).to.equal(groupId);
            expect(createSgStub.callCount).to.equal(1);
        });
    });

    describe('bind', () => {
        it('should add the source sg to its own sg as an ingress rule', async () => {
            const dependencyServiceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'neptune'), serviceParams, accountConfig);
            const dependencyPreDeployContext = new PreDeployContext(dependencyServiceContext);
            const dependentOfServiceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'beanstalk'), {type: 'beanstalk'}, accountConfig);
            const dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);
            const bindSgStub = sandbox.stub(bindPhase, 'bindDependentSecurityGroup')
                .resolves(new BindContext(dependencyServiceContext, dependentOfServiceContext));

            const bindContext = await neptune.bind!(dependencyServiceContext, dependencyPreDeployContext,
                dependentOfServiceContext, dependentOfPreDeployContext);
            expect(bindContext).to.be.instanceof(BindContext);
            expect(bindSgStub.callCount).to.equal(1);
        });
    });

    describe('deploy', () => {
        const envPrefix = 'FAKESERVICE';
        const clusterEndpoint = 'fakeaddress.amazonaws.com';
        const databasePort = 3306;
        const readEndpoint = 'fakeaddress2.amazonaws.com';
        let ownPreDeployContext: PreDeployContext;
        let dependenciesDeployContexts: DeployContext[];
        const deployedStack = {
            Outputs: [
                {
                    OutputKey: 'ClusterEndpoint',
                    OutputValue: clusterEndpoint
                },
                {
                    OutputKey: 'ClusterPort',
                    OutputValue: databasePort
                },
                {
                    OutputKey: 'ClusterReadEndpoint',
                    OutputValue: readEndpoint
                },
                {
                    OutputKey: 'ClusterId',
                    OutputValue: 'FakeClusterId'
                }
            ]
        };

        beforeEach(() => {
            ownPreDeployContext = new PreDeployContext(serviceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: 'FakeId'
            });

            dependenciesDeployContexts = [];
        });

        it('should create the cluster if it doesnt exist', async () => {
            const getStackStub = sandbox.stub(awsCalls.cloudFormation, 'getStack').resolves(null);
            const createStackStub = sandbox.stub(awsCalls.cloudFormation, 'createStack')
                .resolves(deployedStack);

            const deployContext = await neptune.deploy!(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
            expect(getStackStub.callCount).to.equal(1);
            expect(createStackStub.callCount).to.equal(1);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.environmentVariables[`${envPrefix}_CLUSTER_ENDPOINT`]).to.equal(clusterEndpoint);
            expect(deployContext.environmentVariables[`${envPrefix}_PORT`]).to.equal(databasePort);
            expect(deployContext.environmentVariables[`${envPrefix}_READ_ENDPOINT`]).to.equal(readEndpoint);
        });

        it('should not update the database if it already exists', async () => {
            const getStackStub = sandbox.stub(awsCalls.cloudFormation, 'getStack').resolves(deployedStack);
            const updateStackStub = sandbox.stub(awsCalls.cloudFormation, 'updateStack').resolves(null);

            const deployContext = await neptune.deploy!(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
            expect(getStackStub.callCount).to.equal(1);
            expect(updateStackStub.callCount).to.equal(0);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.environmentVariables[`${envPrefix}_CLUSTER_ENDPOINT`]).to.equal(clusterEndpoint);
            expect(deployContext.environmentVariables[`${envPrefix}_PORT`]).to.equal(databasePort);
            expect(deployContext.environmentVariables[`${envPrefix}_READ_ENDPOINT`]).to.equal(readEndpoint);
        });
    });

    describe('unPreDeploy', () => {
        it('should delete the security group', async () => {
            const unPreDeployStub = sandbox.stub(deletePhases, 'unPreDeploySecurityGroup')
                .resolves(new UnPreDeployContext(serviceContext));

            const unPreDeployContext = await neptune.unPreDeploy!(serviceContext);
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployStub.callCount).to.equal(1);
        });
    });

    describe('unBind', () => {
        it('should unbind the security group', async () => {
            const unBindStub = sandbox.stub(deletePhases, 'unBindSecurityGroups')
                .resolves(new UnBindContext(serviceContext));
            const dependencyPreDeployContext = new PreDeployContext(serviceContext);
            const dependentOfServiceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'beanstalk'), {type: 'beanstalk'}, accountConfig);
            const dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);

            const unBindContext = await neptune.unBind!(serviceContext, dependencyPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext);
            expect(unBindContext).to.be.instanceof(UnBindContext);
            expect(unBindStub.callCount).to.equal(1);
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(deletePhases, 'unDeployService')
                .resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await neptune.unDeploy!(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
