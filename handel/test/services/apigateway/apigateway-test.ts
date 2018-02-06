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
import config from '../../../src/account-config/account-config';
import * as deletePhasesCommon from '../../../src/common/delete-phases-common';
import * as lifecyclesCommon from '../../../src/common/lifecycles-common';
import * as preDeployPhaseCommon from '../../../src/common/pre-deploy-phase-common';
import { AccountConfig, PreDeployContext, ServiceConfig, ServiceContext, UnDeployContext, UnPreDeployContext } from '../../../src/datatypes';
import * as apigateway from '../../../src/services/apigateway';
import { APIGatewayConfig } from '../../../src/services/apigateway/config-types';
import * as proxyPassthroughDeployType from '../../../src/services/apigateway/proxy/proxy-passthrough-deploy-type';
import * as swaggerDeployType from '../../../src/services/apigateway/swagger/swagger-deploy-type';

describe('apigateway deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<APIGatewayConfig>;
    let serviceParams: APIGatewayConfig;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'apigateway'
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', 'FakeType', serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        describe('when using proxy passthrough', () => {
            it('should run check from the proxy passthrough module', () => {
                const checkStub = sandbox.stub(proxyPassthroughDeployType, 'check').returns([]);
                serviceContext.params = {
                    type: 'apigateway',
                    proxy: {
                        path_to_code: '.',
                        handler: 'index.handler',
                        runtime: 'nodejs6.10'
                    }
                };
                const errors = apigateway.check(serviceContext, []);
                expect(errors.length).to.equal(0);
                expect(checkStub.callCount).to.equal(1);
            });
        });

        describe('when using swagger configuration', () => {
            it('should run check from the swagger module', () => {
                const checkStub = sandbox.stub(swaggerDeployType, 'check').returns([]);

                serviceContext.params = {
                    type: 'apigateway',
                    swagger: 'fakeswagger.json'
                };

                const errors = apigateway.check(serviceContext, []);
                expect(checkStub.callCount).to.equal(1);
                expect(errors.length).to.equal(0);
            });
        });
    });

    describe('preDeploy', () => {
        it('should create security groups and return the predeploy context when vpc is true', async () => {
            serviceContext.params.vpc = true;
            const response = new PreDeployContext(serviceContext);
            response.securityGroups.push({
                GroupId: 'FakeId'
            });
            const preDeployCreateSecurityGroup = sandbox.stub(preDeployPhaseCommon, 'preDeployCreateSecurityGroup').resolves(response);

            const preDeployContext = await apigateway.preDeploy(serviceContext);
            expect(preDeployContext).to.be.instanceof(PreDeployContext);
            expect(preDeployCreateSecurityGroup.callCount).to.equal(1);
            expect(preDeployContext.securityGroups.length).to.equal(1);
        });

        it('should return an empty preDeploy context when vpc is false', async () => {
            serviceContext.params.vpc = false;
            const preDeployNotRequiredStub = sandbox.stub(lifecyclesCommon, 'preDeployNotRequired').resolves(new PreDeployContext(serviceContext));

            const preDeployContext = await apigateway.preDeploy(serviceContext);
            expect(preDeployNotRequiredStub.callCount).to.equal(1);
            expect(preDeployContext).to.be.instanceof(PreDeployContext);
        });
    });

    describe('deploy', () => {
        describe('when using proxy passthrough', () => {
            it('should call the proxy deploy', async () => {
                const deployStub = sandbox.stub(proxyPassthroughDeployType, 'deploy').resolves({});

                const deployContext = await apigateway.deploy(serviceContext, new PreDeployContext(serviceContext), []);
                expect(deployContext).to.deep.equal({});
                expect(deployStub.callCount).to.equal(1);
            });
        });

        describe('when using swagger configuration', () => {
            it('should call the swagger deploy', async () => {
                serviceContext.params = {
                    type: 'apigateway',
                    swagger: 'fakeswagger.json'
                };

                const deployStub = sandbox.stub(swaggerDeployType, 'deploy').resolves({});

                const deployContext = await apigateway.deploy(serviceContext, new PreDeployContext(serviceContext), []);
                expect(deployContext).to.deep.equal({});
                expect(deployStub.callCount).to.equal(1);
            });
        });
    });

    describe('unPreDeploy', () => {
        it('should return an empty UnPreDeploy context if vpc is false', async () => {
            const unPreDeployNotRequiredStub = sandbox.stub(lifecyclesCommon, 'unPreDeployNotRequired').resolves(new UnPreDeployContext(serviceContext));
            serviceContext.params.vpc = false;
            const unPreDeployContext = await apigateway.unPreDeploy(serviceContext);
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeployNotRequiredStub.callCount).to.equal(1);
        });

        it('should delete the security groups if vpc is true and return the unPreDeploy context', async () => {
            serviceContext.params.vpc = true;
            const unPreDeploySecurityGroup = sandbox.stub(deletePhasesCommon, 'unPreDeploySecurityGroup').resolves(new UnPreDeployContext(serviceContext));
            const unPreDeployContext = await apigateway.unPreDeploy(serviceContext);
            expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
            expect(unPreDeploySecurityGroup.callCount).to.equal(1);
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await apigateway.unDeploy(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
