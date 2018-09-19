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
    ServiceType,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import { awsCalls, bindPhase, checkPhase, deletePhases, deployPhase, preDeployPhase } from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as postgresql from '../../../src/services/postgresql';
import { PostgreSQLConfig } from '../../../src/services/postgresql/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('postgresql deployer', () => {
    let sandbox: sinon.SinonSandbox;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    let serviceContext: ServiceContext<PostgreSQLConfig>;
    let serviceParams: PostgreSQLConfig;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'postgresql',
            database_name: 'mydb',
            postgres_version: '9.6.2'
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'postgresql'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should do require the database_name parameter', () => {
            delete serviceContext.params.database_name;
            const errors = postgresql.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'database_name' parameter is required`);
        });

        it('should require the postgres_version parameter', () => {
            delete serviceContext.params.postgres_version;
            const errors = postgresql.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'postgres_version' parameter is required`);
        });

        it('should reject invalid postgres_version parameter', () => {
            const invalidVersion = '8.6.2';
            serviceContext.params.postgres_version = invalidVersion;
            const errors = postgresql.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`Attempted to generate postgress instance with unsupported version: ${invalidVersion}`);
        });

        it('should work when all required parameters are provided properly', () => {
            const errors = postgresql.check(serviceContext, []);
            expect(errors.length).to.equal(0);
        });

        it('should support postgres 10', () => {
            serviceContext.params.postgres_version = '10.4';
            const errors = postgresql.check(serviceContext, []);
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
            const createSgStub = sandbox.stub(preDeployPhase, 'preDeployCreateSecurityGroup')
                .resolves(preDeployContext);

            const retPreDeployContext = await postgresql.preDeploy(serviceContext);
            expect(retPreDeployContext).to.be.instanceof(PreDeployContext);
            expect(retPreDeployContext.securityGroups.length).to.equal(1);
            expect(retPreDeployContext.securityGroups[0].GroupId).to.equal(groupId);
            expect(createSgStub.callCount).to.equal(1);
        });
    });

    describe('bind', () => {
        it('should add the source sg to its own sg as an ingress rule', async () => {
            const dependencyServiceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'postgresql'), serviceParams, accountConfig);
            const dependencyPreDeployContext = new PreDeployContext(dependencyServiceContext);
            const dependentOfServiceContext = new ServiceContext(appName, envName, 'FakeOtherService', new ServiceType(STDLIB_PREFIX, 'beanstalk'), {type: 'beanstalk'}, accountConfig);
            const dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);
            const bindSgStub = sandbox.stub(bindPhase, 'bindDependentSecurityGroup')
                .resolves(new BindContext(dependencyServiceContext, dependentOfServiceContext));

            const bindContext = await postgresql.bind(dependencyServiceContext, dependencyPreDeployContext,
                dependentOfServiceContext, dependentOfPreDeployContext);
            expect(bindContext).to.be.instanceof(BindContext);
            expect(bindSgStub.callCount).to.equal(1);
        });
    });

    describe('deploy', () => {
        let ownPreDeployContext: PreDeployContext;
        const envPrefix = 'FAKESERVICE';
        let dependenciesDeployContexts: DeployContext[];
        const databaseAddress = 'fakeaddress.amazonaws.com';
        const databasePort = 3306;
        const databaseName = 'mydb';
        const deployedStack = {
            Outputs: [
                {
                    OutputKey: 'DatabaseAddress',
                    OutputValue: databaseAddress
                },
                {
                    OutputKey: 'DatabasePort',
                    OutputValue: databasePort
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
            const addDbCredentialStub = sandbox.stub(deployPhase, 'addItemToSSMParameterStore')
                .resolves(deployedStack);

            const deployContext = await postgresql.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
            expect(getStackStub.callCount).to.equal(1);
            expect(createStackStub.callCount).to.equal(1);
            expect(addDbCredentialStub.callCount).to.equal(2);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.environmentVariables[`${envPrefix}_ADDRESS`]).to.equal(databaseAddress);
            expect(deployContext.environmentVariables[`${envPrefix}_PORT`]).to.equal(databasePort);
            expect(deployContext.environmentVariables[`${envPrefix}_DATABASE_NAME`]).to.equal(databaseName);
        });

        it('should not update the database if it already exists', async () => {
            const getStackStub = sandbox.stub(awsCalls.cloudFormation, 'getStack').resolves(deployedStack);
            const updateStackStub = sandbox.stub(awsCalls.cloudFormation, 'updateStack').resolves(null);

            const deployContext = await postgresql.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
            expect(getStackStub.callCount).to.equal(1);
            expect(updateStackStub.callCount).to.equal(0);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.environmentVariables[`${envPrefix}_ADDRESS`]).to.equal(databaseAddress);
            expect(deployContext.environmentVariables[`${envPrefix}_PORT`]).to.equal(databasePort);
            expect(deployContext.environmentVariables[`${envPrefix}_DATABASE_NAME`]).to.equal(databaseName);
        });
    });

    describe('unPreDeploy', () => {
        it('should delete the security group', async () => {
            const unPreDeployStub = sandbox.stub(deletePhases, 'unPreDeploySecurityGroup')
                .resolves(new UnPreDeployContext(serviceContext));

            const unPreDeployContext = await postgresql.unPreDeploy(serviceContext);
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployStub.callCount).to.equal(1);
        });
    });

    describe('unBind', () => {
        it('should unbind the security group', async () => {
            const unBindStub = sandbox.stub(deletePhases, 'unBindSecurityGroups')
                .resolves(new UnBindContext(serviceContext));

            const unBindContext = await postgresql.unBind(serviceContext);
            expect(unBindContext).to.be.instanceof(UnBindContext);
            expect(unBindStub.callCount).to.equal(1);
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployContext = new UnDeployContext(serviceContext);
            const unDeployStackStub = sandbox.stub(deletePhases, 'unDeployService')
                .resolves(unDeployContext);
            const deleteParametersStub = sandbox.stub(deletePhases, 'deleteServiceItemsFromSSMParameterStore')
                .resolves(unDeployContext);

            const retUnDeployContext = await postgresql.unDeploy(serviceContext);
            expect(retUnDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
            expect(deleteParametersStub.callCount).to.equal(1);
        });
    });
});
