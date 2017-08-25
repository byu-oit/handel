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
const sinon = require('sinon');
const expect = require('chai').expect;
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const preDeployPhaseCommon = require('../../../lib/common/pre-deploy-phase-common');
const lifecyclesCommon = require('../../../lib/common/lifecycles-common');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
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

        it('should fail if vpc is false and a dependency producing security groups is declared', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                path_to_code: '.',
                handler_function: 'index.handler',
                lambda_runtime: 'node.js6.3',
                dependencies: [
                    "FakeDependency"
                ]
            });
            let dependenciesServiceContexts = [];
            dependenciesServiceContexts.push(new ServiceContext("FakeApp", "FakeEnv", "FakeDependency", "mysql", "1"))
            let errors = apigateway.check(serviceContext, dependenciesServiceContexts);
            console.log("ERRORS: ", errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'vpc' parameter is required and must be true when declaring dependencies of type");
        });
    });

    describe('preDeploy', function () {
        it('should create security groups and return the predeploy context when vpc is true', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                "vpc": true
            });
            let response = new PreDeployContext(serviceContext)
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
            let serviceContext = new ServiceContext("FakeName", "FakeEnv", "FakeService", "FakeType", "1", {
                "vpc": false
            });
            let preDeployNotRequiredStub = sandbox.stub(lifecyclesCommon, 'preDeployNotRequired').returns(Promise.resolve(new PreDeployContext(serviceContext)));

            return apigateway.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployNotRequiredStub.callCount).to.equal(1);
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
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

    describe('unPreDeploy', function () {
        it('should return an empty UnPreDeploy context if vpc is false', function () {
            let unPreDeployNotRequiredStub = sandbox.stub(lifecyclesCommon, 'unPreDeployNotRequired').returns(Promise.resolve(new UnPreDeployContext({})));
            let ownServiceContext = {};
            ownServiceContext.params = {};
            ownServiceContext.params.vpc = false;
            return apigateway.unPreDeploy(ownServiceContext)
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeployNotRequiredStub.callCount).to.equal(1);
                });
        });

        it('should delete the security groups if vpc is true and return the unPreDeploy context', function () {
            let ownServiceContext = {};
            ownServiceContext.params = {};
            ownServiceContext.params.vpc = true;
            let unPreDeploySecurityGroup = sandbox.stub(deletePhasesCommon, 'unPreDeploySecurityGroup').returns(Promise.resolve(new UnPreDeployContext(ownServiceContext)));
            return apigateway.unPreDeploy(ownServiceContext)
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeploySecurityGroup.callCount).to.equal(1);
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "apigateway", "1", {});
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return apigateway.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});
