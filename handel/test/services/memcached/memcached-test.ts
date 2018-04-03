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
    BindContext,
    DeployContext,
    PreDeployContext,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as bindPhaseCommon from '../../../src/common/bind-phase-common';
import * as deletePhasesCommon from '../../../src/common/delete-phases-common';
import * as deployPhaseCommon from '../../../src/common/deploy-phase-common';
import * as preDeployPhaseCommon from '../../../src/common/pre-deploy-phase-common';
import {
    AccountConfig,
    ServiceContext,
    ServiceType,
} from '../../../src/datatypes';
import * as memcached from '../../../src/services/memcached';
import { MemcachedServiceConfig } from '../../../src/services/memcached/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('memcached deployer', () => {
    let sandbox: sinon.SinonSandbox;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    let serviceContext: ServiceContext<MemcachedServiceConfig>;
    let serviceParams: MemcachedServiceConfig;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'memcached',
            memcached_version: '3.2.4',
            instance_type: 'cache.t2.micro'
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'memcached'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should do require the instance_type parameter', () => {
            delete serviceContext.params.instance_type;
            const errors = memcached.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'instance_type' parameter is required`);
        });

        it('should require the memcached_version parameter', () => {
            delete serviceContext.params.memcached_version;
            const errors = memcached.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'memcached_version' parameter is required`);
        });

        it('should return ok when all required parameters are given', () => {
            const errors = memcached.check(serviceContext, []);
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
            const preDeployCreateSgStub = sandbox.stub(preDeployPhaseCommon, 'preDeployCreateSecurityGroup').resolves(preDeployContext);

            const retContext = await memcached.preDeploy(serviceContext);
            expect(retContext).to.be.instanceof(PreDeployContext);
            expect(retContext.securityGroups.length).to.equal(1);
            expect(retContext.securityGroups[0].GroupId).to.equal(groupId);
            expect(preDeployCreateSgStub.callCount).to.equal(1);
        });
    });

    describe('bind', () => {
        it('should add the source sg to its own sg as an ingress rule', async () => {
            const dependentOfServiceContext = new ServiceContext(appName, envName, 'DependentOFService', new ServiceType(STDLIB_PREFIX, 'ecs'), {type: 'ecs'}, accountConfig);
            const bindSgStub = sandbox.stub(bindPhaseCommon, 'bindDependentSecurityGroupToSelf').resolves(new BindContext(serviceContext, dependentOfServiceContext));

            const bindContext = await memcached.bind(serviceContext, new PreDeployContext(serviceContext), dependentOfServiceContext, new PreDeployContext(dependentOfServiceContext));
            expect(bindContext).to.be.instanceof(BindContext);
            expect(bindSgStub.callCount).to.equal(1);
        });
    });

    describe('deploy', () => {
        let ownPreDeployContext: PreDeployContext;
        let dependenciesDeployContexts: DeployContext[];
        const cacheAddress = 'fakeaddress.byu.edu';
        const cachePort = 11211;
        const envPrefix = 'FAKESERVICE';

        beforeEach(() => {
            ownPreDeployContext = new PreDeployContext(serviceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: 'FakeId'
            });

            dependenciesDeployContexts = [];
        });

        it('should deploy the cluster', async () => {
            const deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').resolves({
                Outputs: [
                    {
                        OutputKey: 'CacheAddress',
                        OutputValue: cacheAddress
                    },
                    {
                        OutputKey: 'CachePort',
                        OutputValue: cachePort
                    }
                ]
            });

            const deployContext = await memcached.deploy(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
            expect(deployStackStub.callCount).to.equal(1);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.environmentVariables[`${envPrefix}_ADDRESS`]).to.equal(cacheAddress);
            expect(deployContext.environmentVariables[`${envPrefix}_PORT`]).to.equal(cachePort);
        });
    });

    describe('unPreDeploy', () => {
        it('should delete the security group', async () => {
            const unPreDeployStub = sandbox.stub(deletePhasesCommon, 'unPreDeploySecurityGroup').resolves(new UnPreDeployContext(serviceContext));

            const unPreDeployContext = await memcached.unPreDeploy(serviceContext);
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployStub.callCount).to.equal(1);
        });
    });

    describe('unBind', () => {
        it('should unbind the security group', async () => {
            const unBindStub = sandbox.stub(deletePhasesCommon, 'unBindSecurityGroups').resolves(new UnBindContext(serviceContext));

            const unBindContext = await memcached.unBind(serviceContext);
            expect(unBindContext).to.be.instanceof(UnBindContext);
            expect(unBindStub.callCount).to.equal(1);
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await memcached.unDeploy(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
