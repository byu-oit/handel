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
import { bindPhase, deletePhases, deployPhase, preDeployPhase } from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as iamCalls from '../../../src/aws/iam-calls';
import { Service } from '../../../src/services/elasticsearch';
import { ElasticsearchConfig } from '../../../src/services/elasticsearch/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('elasticsearch deployer', () => {
    let sandbox: sinon.SinonSandbox;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    let serviceContext: ServiceContext<ElasticsearchConfig>;
    let serviceParams: ElasticsearchConfig;
    let accountConfig: AccountConfig;
    let elasticsearch: ServiceDeployer;

    beforeEach(async () => {
        elasticsearch = new Service();
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'elasticsearch',
            version: 6.2
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'elasticsearch'), serviceParams, accountConfig);
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

            const retPreDeployContext = await elasticsearch.preDeploy!(serviceContext);
            expect(retPreDeployContext).to.be.instanceof(PreDeployContext);
            expect(retPreDeployContext.securityGroups.length).to.equal(1);
            expect(retPreDeployContext.securityGroups[0].GroupId).to.equal(groupId);
            expect(createSgStub.callCount).to.equal(1);
        });
    });

    describe('bind', () => {
        it('should add the source sg to its own sg as an ingress rule', async () => {
            const dependencyServiceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'elasticsearch'), serviceParams, accountConfig);
            const dependencyPreDeployContext = new PreDeployContext(dependencyServiceContext);
            const dependentOfServiceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'beanstalk'), {type: 'beanstalk'}, accountConfig);
            const dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);
            const bindSgStub = sandbox.stub(bindPhase, 'bindDependentSecurityGroup')
                .resolves(new BindContext(dependencyServiceContext, dependentOfServiceContext));

            const bindContext = await elasticsearch.bind!(dependencyServiceContext, dependencyPreDeployContext,
                dependentOfServiceContext, dependentOfPreDeployContext);
            expect(bindContext).to.be.instanceof(BindContext);
            expect(bindSgStub.callCount).to.equal(1);
        });
    });

    describe('deploy', () => {
        const envPrefix = 'FAKESERVICE';
        const domainEndpoint = 'fakeaddress.amazonaws.com';
        const domainName = 'FakeDomainName';
        let ownPreDeployContext: PreDeployContext;
        let dependenciesDeployContexts: DeployContext[];
        const deployedStack = {
            Outputs: [
                {
                    OutputKey: 'DomainEndpoint',
                    OutputValue: domainEndpoint
                },
                {
                    OutputKey: 'DomainName',
                    OutputValue: domainName
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

        it('should deploy the cluster', async () => {
            const createRoleStub = sandbox.stub(iamCalls, 'createServiceLinkedRole').resolves({});
            const deployStackStub = sandbox.stub(deployPhase, 'deployCloudFormationStack').resolves(deployedStack);

            const deployContext = await elasticsearch.deploy!(serviceContext, ownPreDeployContext, dependenciesDeployContexts);
            expect(deployStackStub.callCount).to.equal(1);
            expect(createRoleStub.callCount).to.equal(1);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.environmentVariables[`${envPrefix}_DOMAIN_ENDPOINT`]).to.equal(domainEndpoint);
            expect(deployContext.environmentVariables[`${envPrefix}_DOMAIN_NAME`]).to.equal(domainName);
        });
    });

    describe('unPreDeploy', () => {
        it('should delete the security group', async () => {
            const unPreDeployStub = sandbox.stub(deletePhases, 'unPreDeploySecurityGroup')
                .resolves(new UnPreDeployContext(serviceContext));

            const unPreDeployContext = await elasticsearch.unPreDeploy!(serviceContext);
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

            const unBindContext = await elasticsearch.unBind!(serviceContext, dependencyPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext);
            expect(unBindContext).to.be.instanceof(UnBindContext);
            expect(unBindStub.callCount).to.equal(1);
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(deletePhases, 'unDeployService')
                .resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await elasticsearch.unDeploy!(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
