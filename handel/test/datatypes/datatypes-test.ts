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
import config from '../../src/account-config/account-config';
import { BindContext, ConsumeEventsContext, DeployContext, EnvironmentContext, PreDeployContext, ProduceEventsContext, ServiceContext, UnBindContext, UnDeployContext, UnPreDeployContext, AccountConfig } from '../../src/datatypes';

describe('Datatypes Module', () => {
    let accountConfig: AccountConfig;

    beforeEach(async () => {
         accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    describe('BindContext', () => {
        it('should be able to be constructed from a ServiceContext', () => {
            const dependencyServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', {type: 'FakeType'}, accountConfig);
            const dependentOfServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService2', 'FakeType2', {type: 'FakeType2'}, accountConfig);
            const bindContext = new BindContext(dependencyServiceContext, dependentOfServiceContext);
            expect(bindContext.dependencyServiceContext.appName).to.equal(dependencyServiceContext.appName);
            expect(bindContext.dependencyServiceContext.environmentName).to.equal(dependencyServiceContext.environmentName);
            expect(bindContext.dependencyServiceContext.serviceName).to.equal(dependencyServiceContext.serviceName);
            expect(bindContext.dependencyServiceContext.serviceType).to.equal(dependencyServiceContext.serviceType);
            expect(bindContext.dependentOfServiceContext.appName).to.equal(dependentOfServiceContext.appName);
            expect(bindContext.dependentOfServiceContext.environmentName).to.equal(dependentOfServiceContext.environmentName);
            expect(bindContext.dependentOfServiceContext.serviceName).to.equal(dependentOfServiceContext.serviceName);
            expect(bindContext.dependentOfServiceContext.serviceType).to.equal(dependentOfServiceContext.serviceType);
        });
    });

    describe('ConsumeEventsContext', () => {
        it('should be able to be constructed from a ServiceContext', () => {
            const consumingServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', {type: 'FakeType'}, accountConfig);
            const producingServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService2', 'FakeType2', {type: 'FakeType2'}, accountConfig);
            const consumeContext = new ConsumeEventsContext(consumingServiceContext, producingServiceContext);
            expect(consumeContext.consumingServiceContext.appName).to.equal(consumingServiceContext.appName);
            expect(consumeContext.consumingServiceContext.environmentName).to.equal(consumingServiceContext.environmentName);
            expect(consumeContext.consumingServiceContext.serviceName).to.equal(consumingServiceContext.serviceName);
            expect(consumeContext.consumingServiceContext.serviceType).to.equal(consumingServiceContext.serviceType);
            expect(consumeContext.producingServiceContext.appName).to.equal(producingServiceContext.appName);
            expect(consumeContext.producingServiceContext.environmentName).to.equal(producingServiceContext.environmentName);
            expect(consumeContext.producingServiceContext.serviceName).to.equal(producingServiceContext.serviceName);
            expect(consumeContext.producingServiceContext.serviceType).to.equal(producingServiceContext.serviceType);
        });
    });

    describe('DeployContext', () => {
        it('should be able to be constructed from a ServiceContext', () => {
            const serviceContext = new ServiceContext('appName', 'environmentName', 'serviceName', 'serviceType', {type: 'serviceType'}, accountConfig);
            const deployContext = new DeployContext(serviceContext);
            expect(deployContext.appName).to.equal(serviceContext.appName);
            expect(deployContext.environmentName).to.equal(serviceContext.environmentName);
            expect(deployContext.serviceName).to.equal(serviceContext.serviceName);
            expect(deployContext.serviceType).to.equal(serviceContext.serviceType);
            expect(deployContext.eventOutputs).to.deep.equal({});
            expect(deployContext.policies).to.deep.equal([]);
            expect(deployContext.environmentVariables).to.deep.equal({});
            expect(deployContext.scripts).to.deep.equal([]);
        });
    });

    describe('EnvironmentContext', () => {
        it('should be able to be constructed with required parameters', () => {
            const appName = 'FakeApp';
            const environmentName = 'FakeEnvironment';
            const environmentContext = new EnvironmentContext(appName, environmentName, accountConfig);
            expect(environmentContext.appName).to.equal(appName);
            expect(environmentContext.environmentName).to.equal(environmentName);
            expect(environmentContext.accountConfig).to.deep.equal(accountConfig);
            expect(environmentContext.serviceContexts).to.deep.equal({});
        });
    });

    describe('PreDeployContext', () => {
        it('should be able to be constructed from a ServiceContext', () => {
            const serviceContext = new ServiceContext('appName', 'environmentName', 'serviceName', 'serviceType', {type: 'serviceType'}, accountConfig);
            const preDeployContext = new PreDeployContext(serviceContext);
            expect(preDeployContext.appName).to.equal(serviceContext.appName);
            expect(preDeployContext.environmentName).to.equal(serviceContext.environmentName);
            expect(preDeployContext.serviceName).to.equal(serviceContext.serviceName);
            expect(preDeployContext.serviceType).to.equal(serviceContext.serviceType);
            expect(preDeployContext.securityGroups).to.deep.equal([]);
        });
    });

    describe('ProduceEventsContext', () => {
        it('should be able to be constructed from a ServiceContext', () => {
            const producingServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService2', 'FakeType2', {type: 'FakeType2'}, accountConfig);
            const consumingServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', {type: 'FakeType'}, accountConfig);
            const consumeContext = new ProduceEventsContext(producingServiceContext, consumingServiceContext);
            expect(consumeContext.producingServiceContext.appName).to.equal(producingServiceContext.appName);
            expect(consumeContext.producingServiceContext.environmentName).to.equal(producingServiceContext.environmentName);
            expect(consumeContext.producingServiceContext.serviceName).to.equal(producingServiceContext.serviceName);
            expect(consumeContext.producingServiceContext.serviceType).to.equal(producingServiceContext.serviceType);
            expect(consumeContext.consumingServiceContext.appName).to.equal(consumingServiceContext.appName);
            expect(consumeContext.consumingServiceContext.environmentName).to.equal(consumingServiceContext.environmentName);
            expect(consumeContext.consumingServiceContext.serviceName).to.equal(consumingServiceContext.serviceName);
            expect(consumeContext.consumingServiceContext.serviceType).to.equal(consumingServiceContext.serviceType);
        });
    });

    describe('ServiceContext', () => {
        it('should be able to be constructed from required params', () => {
            const appName = 'FakeApp';
            const environmentName = 'FakeEnv';
            const serviceName = 'FakeService';
            const serviceType = 'FakeType';
            const params = {
                type: serviceType
            };
            const serviceContext = new ServiceContext(appName, environmentName, serviceName, serviceType, params, accountConfig);
            expect(serviceContext.appName).to.equal(appName);
            expect(serviceContext.environmentName).to.equal(environmentName);
            expect(serviceContext.serviceName).to.equal(serviceName);
            expect(serviceContext.serviceType).to.equal(serviceType);
            expect(serviceContext.params).to.deep.equal(params);
        });
    });

    describe('UnBindContext', () => {
        it('should be able to be constructed from a ServiceContext', () => {
            const serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', {type: 'FakeType'}, accountConfig);
            const unBindContext = new UnBindContext(serviceContext);
            expect(unBindContext.appName).to.equal(serviceContext.appName);
            expect(unBindContext.environmentName).to.equal(serviceContext.environmentName);
            expect(unBindContext.serviceName).to.equal(serviceContext.serviceName);
            expect(unBindContext.serviceType).to.equal(serviceContext.serviceType);
        });
    });

    describe('UnDeployContext', () => {
        it('should be able to be constructed from a ServiceContext', () => {
            const serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', {type: 'FakeType'}, accountConfig);
            const unDeployContext = new UnDeployContext(serviceContext);
            expect(unDeployContext.appName).to.equal(serviceContext.appName);
            expect(unDeployContext.environmentName).to.equal(serviceContext.environmentName);
            expect(unDeployContext.serviceName).to.equal(serviceContext.serviceName);
            expect(unDeployContext.serviceType).to.equal(serviceContext.serviceType);
        });
    });

    describe('UnPreDeployContext', () => {
        it('should be able to be constructed from a ServiceContext', () => {
            const serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', {type: 'FakeType'}, accountConfig);
            const unPreDeployContext = new UnPreDeployContext(serviceContext);
            expect(unPreDeployContext.appName).to.equal(serviceContext.appName);
            expect(unPreDeployContext.environmentName).to.equal(serviceContext.environmentName);
            expect(unPreDeployContext.serviceName).to.equal(serviceContext.serviceName);
            expect(unPreDeployContext.serviceType).to.equal(serviceContext.serviceType);
        });
    });
});
