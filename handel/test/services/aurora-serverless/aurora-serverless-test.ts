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
    ServiceConfig,
    ServiceContext,
    ServiceDeployer,
    ServiceType,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import { awsCalls, bindPhase, deletePhases, deployPhase, preDeployPhase } from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import { Service } from '../../../src/services/aurora-serverless';
import { AuroraServerlessConfig, AuroraServerlessEngine } from '../../../src/services/aurora-serverless/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('aurora-serverless deployer', () => {
    let sandbox: sinon.SinonSandbox;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    let serviceContext: ServiceContext<AuroraServerlessConfig>;
    let serviceParams: AuroraServerlessConfig;
    let accountConfig: AccountConfig;
    let aurora: ServiceDeployer;

    beforeEach(async () => {
        aurora = new Service();
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.createSandbox();
        serviceParams = {
            type: 'aurora',
            engine: AuroraServerlessEngine.mysql,
            version: '5.6.10a',
            database_name: 'mydb'
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'aurora-serverless'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    // At the moment, check only validates the JSON schema, so no tests here for that phase at the moment

    describe('preDeploy', () => {
        const groupId = 'FakeSgGroupId';
        let preDeployContext: PreDeployContext;
        let createSgStub: sinon.SinonStub;

        beforeEach(() => {
            preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push({
                GroupId: groupId
            });
            createSgStub = sandbox.stub(preDeployPhase, 'preDeployCreateSecurityGroup')
                .resolves(preDeployContext);
        });

        it('should create a security group when using MySQL', async () => {
            const retPreDeployContext = await aurora.preDeploy!(serviceContext);
            expect(createSgStub.getCall(0).args[1]).to.equal(3306);
            expect(retPreDeployContext).to.be.instanceof(PreDeployContext);
            expect(retPreDeployContext.securityGroups.length).to.equal(1);
            expect(retPreDeployContext.securityGroups[0].GroupId).to.equal(groupId);
            expect(createSgStub.callCount).to.equal(1);
        });
    });

    describe('bind', () => {
        let dependencyServiceContext: ServiceContext<AuroraServerlessConfig>;
        let dependencyPreDeployContext: PreDeployContext;
        let dependentOfServiceContext: ServiceContext<ServiceConfig>;
        let dependentOfPreDeployContext: PreDeployContext;
        let bindSgStub: sinon.SinonStub;

        beforeEach(() => {
            dependencyServiceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'aurora'), serviceParams, accountConfig);
            dependencyPreDeployContext = new PreDeployContext(dependencyServiceContext);
            dependentOfServiceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'beanstalk'), {type: 'beanstalk'}, accountConfig);
            dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);
            bindSgStub = sandbox.stub(bindPhase, 'bindDependentSecurityGroup')
                .resolves(new BindContext(dependencyServiceContext, dependentOfServiceContext));
        });

        it('should add the source sg to its own sg as an ingress rule when using MySQL', async () => {
            const bindContext = await aurora.bind!(dependencyServiceContext, dependencyPreDeployContext,
                dependentOfServiceContext, dependentOfPreDeployContext);
            expect(bindContext).to.be.instanceof(BindContext);
            expect(bindSgStub.callCount).to.equal(1);
            expect(bindSgStub.getCall(0).args[5]).to.equal(3306);
        });

    });

    describe('deploy', () => {
        const envPrefix = 'FAKESERVICE';
        const clusterEndpoint = 'fakeaddress.amazonaws.com';
        const databasePort = 3306;
        const databaseName = 'mydb';
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
                    OutputValue: clusterEndpoint
                },
                {
                    OutputKey: 'DatabaseName',
                    OutputValue: databaseName
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
            const addCredentialsStub = sandbox.stub(deployPhase, 'addItemToSSMParameterStore')
                .resolves(deployedStack);

            const deployContext = await aurora.deploy!(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
            expect(getStackStub.callCount).to.equal(1);
            expect(createStackStub.callCount).to.equal(1);
            expect(addCredentialsStub.callCount).to.equal(2);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.environmentVariables[`${envPrefix}_CLUSTER_ENDPOINT`]).to.equal(clusterEndpoint);
            expect(deployContext.environmentVariables[`${envPrefix}_PORT`]).to.equal(databasePort);
            expect(deployContext.environmentVariables[`${envPrefix}_READ_ENDPOINT`]).to.equal(clusterEndpoint);
            expect(deployContext.environmentVariables[`${envPrefix}_DATABASE_NAME`]).to.equal(databaseName);
        });

        it('should not update the database if it already exists', async () => {
            const getStackStub = sandbox.stub(awsCalls.cloudFormation, 'getStack').resolves(deployedStack);
            const updateStackStub = sandbox.stub(awsCalls.cloudFormation, 'updateStack').resolves(null);

            const deployContext = await aurora.deploy!(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
            expect(getStackStub.callCount).to.equal(1);
            expect(updateStackStub.callCount).to.equal(0);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.environmentVariables[`${envPrefix}_CLUSTER_ENDPOINT`]).to.equal(clusterEndpoint);
            expect(deployContext.environmentVariables[`${envPrefix}_PORT`]).to.equal(databasePort);
            expect(deployContext.environmentVariables[`${envPrefix}_READ_ENDPOINT`]).to.equal(clusterEndpoint);
            expect(deployContext.environmentVariables[`${envPrefix}_DATABASE_NAME`]).to.equal(databaseName);
        });
    });

    describe('unPreDeploy', () => {
        it('should delete the security group', async () => {
            const unPreDeployStub = sandbox.stub(deletePhases, 'unPreDeploySecurityGroup')
                .resolves(new UnPreDeployContext(serviceContext));

            const unPreDeployContext = await aurora.unPreDeploy!(serviceContext);
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployStub.callCount).to.equal(1);
        });
    });

    describe('unBind', () => {
        it('should unbind the security group', async () => {
            const dependencyPreDeployContext = new PreDeployContext(serviceContext);
            const dependentOfServiceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'beanstalk'), {type: 'beanstalk'}, accountConfig);
            const dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);
            const unBindStub = sandbox.stub(deletePhases, 'unBindService').resolves(new UnBindContext(serviceContext, dependentOfServiceContext));

            const unBindContext = await aurora.unBind!(serviceContext, dependencyPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext);
            expect(unBindContext).to.be.instanceof(UnBindContext);
            expect(unBindStub.callCount).to.equal(1);
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(deletePhases, 'unDeployService')
                .resolves(new UnDeployContext(serviceContext));
            const deleteParametersStub = sandbox.stub(deletePhases, 'deleteServiceItemsFromSSMParameterStore').resolves({});

            const unDeployContext = await aurora.unDeploy!(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
            expect(deleteParametersStub.callCount).to.equal(1);
        });
    });
});
