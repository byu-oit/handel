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
const apigateway = require('../../../lib/services/apigateway');
const ServiceContext = require('../../../lib/datatypes/service-context');
const sinon = require('sinon');
const expect = require('chai').expect;
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const proxyPassthroughDeployType = require('../../../lib/services/apigateway/proxy/proxy-passthrough-deploy-type');
const swaggerDeployType = require('../../../lib/services/apigateway/swagger/swagger-deploy-type');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const preDeployPhaseCommon = require('../../../lib/common/pre-deploy-phase-common');
const lifecyclesCommon = require('../../../lib/common/lifecycles-common');

const config = require('../../../lib/account-config/account-config');

describe('apigateway deployer', function () {
    let sandbox;
    let serviceContext;
    let appName = "FakeApp";
    let envName = "FakeEnv";

    beforeEach(function () {
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext(appName, envName, "FakeService", "FakeType", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        describe('when using proxy passthrough', function () {
            it("should run check from the proxy passthrough module", function () {
                let checkStub = sandbox.stub(proxyPassthroughDeployType, 'check').returns([]);

                serviceContext.params = {
                    proxy: {}
                }

                let errors = apigateway.check(serviceContext);
                expect(errors.length).to.equal(0);
                expect(checkStub.callCount).to.equal(1);
            });
        });

        describe('when using swagger configuration', function () {
            it('should run check from the swagger module', function () {
                let checkStub = sandbox.stub(swaggerDeployType, 'check').returns([]);

                serviceContext.params = {
                    swagger: 'fakeswagger.json'
                }

                let errors = apigateway.check(serviceContext);
                expect(checkStub.callCount).to.equal(1);
                expect(errors.length).to.equal(0);
            });
        });
    });

    describe('preDeploy', function () {
        it('should create security groups and return the predeploy context when vpc is true', function () {
            serviceContext.params = {
                vpc: true
            }
            let response = new PreDeployContext(serviceContext, "API Gateway")
            response.securityGroups.push("FakeSecurityGroup")
            let preDeployCreateSecurityGroup = sandbox.stub(preDeployPhaseCommon, 'preDeployCreateSecurityGroup')
                .returns(Promise.resolve(response));

            return apigateway.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                    expect(preDeployCreateSecurityGroup.callCount).to.equal(1);
                    expect(preDeployContext.securityGroups.length).to.equal(1);
                });
        });

        it('should return an empty preDeploy context when vpc is false', function () {
            serviceContext.params = {
                "vpc": false
            }
            let preDeployNotRequiredStub = sandbox.stub(lifecyclesCommon, 'preDeployNotRequired').returns(Promise.resolve(new PreDeployContext(serviceContext)));

            return apigateway.preDeploy(serviceContext, "API Gateway")
                .then(preDeployContext => {
                    expect(preDeployNotRequiredStub.callCount).to.equal(1);
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                });
        });
    });

    describe('deploy', function () {
        describe('when using proxy passthrough', function () {
            it('should call the proxy deploy', function () {
                serviceContext.params = {
                    proxy: {}
                }

                let deployStub = sandbox.stub(proxyPassthroughDeployType, 'deploy').returns(Promise.resolve({}));

                return apigateway.deploy(serviceContext, {}, [])
                    .then(deployContext => {
                        expect(deployContext).to.deep.equal({});
                        expect(deployStub.callCount).to.equal(1);
                    });
            });
        });

        describe('when using swagger configuration', function () {
            it('should call the swagger deploy', function () {
                serviceContext.params = {
                    swagger: 'fakeswagger.json'
                }

                let deployStub = sandbox.stub(swaggerDeployType, 'deploy').returns(Promise.resolve({}));

                return apigateway.deploy(serviceContext, {}, [])
                    .then(deployContext => {
                        expect(deployContext).to.deep.equal({});
                        expect(deployStub.callCount).to.equal(1);
                    });
            });
        });
    });

    describe('unPreDeploy', function () {
        it('should return an empty UnPreDeploy context if vpc is false', function () {
            let unPreDeployNotRequiredStub = sandbox.stub(lifecyclesCommon, 'unPreDeployNotRequired').returns(Promise.resolve(new UnPreDeployContext({})));
            serviceContext.params = {
                vpc: false
            }
            return apigateway.unPreDeploy(serviceContext, "API Gateway")
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeployNotRequiredStub.callCount).to.equal(1);
                });
        });

        it('should delete the security groups if vpc is true and return the unPreDeploy context', function () {
            serviceContext.params = {
                vpc: true
            }
            let unPreDeploySecurityGroup = sandbox.stub(deletePhasesCommon, 'unPreDeploySecurityGroup').returns(Promise.resolve(new UnPreDeployContext(serviceContext)));
            return apigateway.unPreDeploy(serviceContext, "API Gateway")
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeploySecurityGroup.callCount).to.equal(1);
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return apigateway.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});
