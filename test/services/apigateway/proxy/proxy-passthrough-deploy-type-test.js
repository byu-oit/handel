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
const proxyPassthroughDeployType = require('../../../../dist/services/apigateway/proxy/proxy-passthrough-deploy-type');
const ServiceContext = require('../../../../dist/datatypes/service-context').ServiceContext;
const DeployContext = require('../../../../dist/datatypes/deploy-context').DeployContext;
const PreDeployContext = require('../../../../dist/datatypes/pre-deploy-context').PreDeployContext;
const sinon = require('sinon');
const expect = require('chai').expect;
const deployPhaseCommon = require('../../../../dist/common/deploy-phase-common');

const config = require('../../../../dist/account-config/account-config').default;

describe('apigateway proxy deploy type', function () {
    let sandbox;
    let serviceContext;
    let appName = "FakeApp";
    let envName = "FakeEnv";

    beforeEach(function () {
        return config(`${__dirname}/../../../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext(appName, envName, "FakeService", "FakeType", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it("should require the 'path_to_code' param", function () {
            serviceContext.params = {
                proxy: {
                    runtime: 'FakeRuntime',
                    handler: 'FakeFunction'
                }
            }

            let errors = proxyPassthroughDeployType.check(serviceContext, [], "API Gateway");
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'path_to_code' parameter is required");
        });

        it("should require the 'runtime' param", function () {
            serviceContext.params = {
                proxy: {
                    path_to_code: './',
                    handler: 'FakeFunction'
                }
            }

            let errors = proxyPassthroughDeployType.check(serviceContext, [], "API Gateway");
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'runtime' parameter is required");
        });

        it("should require the 'handler' param", function () {
            serviceContext.params = {
                proxy: {
                    path_to_code: './',
                    runtime: 'FakeRuntime'
                }
            }

            let errors = proxyPassthroughDeployType.check(serviceContext, [], "API Gateway");
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'handler' parameter is required");
        });

        it('should fail if vpc is false and a dependency producing security groups is declared', function () {
            serviceContext.params = {
                proxy: {
                    path_to_code: '.',
                    handler: 'index.handler',
                    runtime: 'node.js6.3'
                },
                dependencies: [
                    "FakeDependency"
                ]
            }
            let dependenciesServiceContexts = [];
            dependenciesServiceContexts.push(new ServiceContext("FakeApp", "FakeEnv", "FakeDependency", "mysql", {}, {}))
            let errors = proxyPassthroughDeployType.check(serviceContext, dependenciesServiceContexts, "API Gateway");
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'vpc' parameter is required and must be true when declaring dependencies of type");
        });
    });

    describe('deploy', function () {
        beforeEach(function () {
            serviceContext.params = {
                proxy: {
                    path_to_code: `${__dirname}/mytestartifact.war`,
                    runtime: 'nodejs6.10',
                    handler: 'index.handler'
                }
            }
        });

        function getDependencyDeployContexts(appName, envName) {
            let dependenciesDeployContexts = [];
            let dependencyServiceName = "DependencyService";
            let dependencyServiceType = "dynamodb";
            let dependencyServiceParams = {}
            let dependencyServiceContext = new ServiceContext(appName, envName, dependencyServiceName, dependencyServiceType, dependencyServiceParams, {});
            let dependencyDeployContext = new DeployContext(dependencyServiceContext);
            dependenciesDeployContexts.push(dependencyDeployContext);
            return dependenciesDeployContexts;
        }

        it('should deploy the service', function () {
            //Set up input parameters
            let ownPreDeployContext = new PreDeployContext(serviceContext);
            let dependenciesDeployContexts = getDependencyDeployContexts(appName, envName);

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

            return proxyPassthroughDeployType.deploy("FakeStack", serviceContext, ownPreDeployContext, dependenciesDeployContexts, "API Gateway")
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(uploadDeployableArtifactToHandelBucketStub.calledOnce).to.be.true;
                    expect(deployStackStub.calledOnce).to.be.true;
                });
        });
    });
});
