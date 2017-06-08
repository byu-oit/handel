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
const accountConfig = require('../../../lib/common/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const apigateway = require('../../../lib/services/apigateway');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const sinon = require('sinon');
const expect = require('chai').expect;
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const UnBindContext = require('../../../lib/datatypes/un-bind-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');

describe('apigateway deployer', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it("should require the 'path_to_code' param", function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                lambda_runtime: 'FakeRuntime',
                handler_function: 'FakeFunction'
            });

            let errors = apigateway.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'path_to_code' parameter is required");
        });

        it("should require the 'lambda_runtime' param", function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                path_to_code: './',
                handler_function: 'FakeFunction'
            });

            let errors = apigateway.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'lambda_runtime' parameter is required");
        });

        it("should require the 'handler_function' param", function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                path_to_code: './',
                lambda_runtime: 'FakeRuntime'
            });

            let errors = apigateway.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'handler_function' parameter is required");
        });
    });

    describe('preDeploy', function () {
        it('should return an empty preDeploy context', function () {
            let serviceContext = new ServiceContext("FakeName", "FakeEnv", "FakeService", "FakeType", "1", {});
            return apigateway.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                });
        });
    });

    describe('bind', function () {
        it('should return an empty bind context', function () {
            return apigateway.bind(null, null, null, null)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('deploy', function () {
        function getOwnServiceContext(appName, envName, deployVersion) {
            let ownServiceName = "OwnService";
            let ownServiceType = "apigateway";
            let ownServiceParams = {
                path_to_code: `${__dirname}/mytestartifact.war`,
                lambda_runtime: 'nodejs6.10',
                handler_runtime: 'index.handler'
            };
            let ownServiceContext = new ServiceContext(appName, envName, ownServiceName, ownServiceType, deployVersion, ownServiceParams);
            return ownServiceContext;
        }

        function getDependencyDeployContexts(appName, envName, deployVersion) {
            let dependenciesDeployContexts = [];
            let dependencyServiceName = "DependencyService";
            let dependencyServiceType = "dynamodb";
            let dependencyServiceParams = {}
            let dependencyServiceContext = new ServiceContext(appName, envName, dependencyServiceName, dependencyServiceType, deployVersion, dependencyServiceParams);
            let dependencyDeployContext = new DeployContext(dependencyServiceContext);
            dependenciesDeployContexts.push(dependencyDeployContext);
            return dependenciesDeployContexts;
        }

        it('should deploy the service', function () {
            //Set up input parameters
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let ownServiceContext = getOwnServiceContext(appName, envName, deployVersion);
            let ownPreDeployContext = new PreDeployContext(ownServiceContext);
            let dependenciesDeployContexts = getDependencyDeployContexts(appName, envName, deployVersion);

            //Stub out dependent services
            let bucketName = "FakeBucket";
            let bucketKey = "FakeBucketKey";
            let uploadDeployableArtifactToHandelBucketStub = sandbox.stub(deployPhaseCommon, 'uploadDeployableArtifactToHandelBucket').returns(Promise.resolve({
                Bucket: bucketName,
                Key: bucketKey
            }));
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'RestApiId',
                    OutputValue: 'someApiId'
                }]
            }));

            return apigateway.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(uploadDeployableArtifactToHandelBucketStub.calledOnce).to.be.true;
                    expect(deployStackStub.calledOnce).to.be.true;
                });
        });
    });

    describe('consumeEvents', function () {
        it('should throw an error because API gateway cant consume event services', function () {
            return apigateway.consumeEvents(null, null, null, null)
                .then(consumeEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("API Gateway service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function () {
        it('should throw an error because our API gateway service doesnt produce events for other services', function () {
            return apigateway.produceEvents(null, null, null, null)
                .then(produceEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("API Gateway service doesn't produce events");
                });
        });
    });

    describe('unPreDeploy', function () {
        it('should return an empty UnPreDeploy context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "apigateway", "1", {});
            return apigateway.unPreDeploy(serviceContext)
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                });
        });
    });

    describe('unBind', function () {
        it('should return an empty UnBind context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "apigateway", "1", {});
            return apigateway.unBind(serviceContext)
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "apigateway", "1", {});
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployCloudFormationStack').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return apigateway.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});