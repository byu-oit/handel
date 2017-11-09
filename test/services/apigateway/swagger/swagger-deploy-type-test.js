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
const swaggerDeployType = require('../../../../dist/services/apigateway/swagger/swagger-deploy-type');
const ServiceContext = require('../../../../dist/datatypes/service-context').ServiceContext;
const DeployContext = require('../../../../dist/datatypes/deploy-context').DeployContext;
const PreDeployContext = require('../../../../dist/datatypes/pre-deploy-context').PreDeployContext;
const sinon = require('sinon');
const expect = require('chai').expect;
const deployPhaseCommon = require('../../../../dist/common/deploy-phase-common');

const config = require('../../../../dist/account-config/account-config');

describe('apigateway swagger deploy type', function () {
    let sandbox;
    let serviceContext;
    let appName = "FakeApp";
    let envName = "FakeEnv";

    beforeEach(function () {
        return config(`${__dirname}/../../../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                let params = {
                    swagger: `${__dirname}/test-swagger.json`
                }
                serviceContext = new ServiceContext(appName, envName, "FakeService", "FakeType", params, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it("should not check anything yet", function () {
            let errors = swaggerDeployType.check(serviceContext, [], "API Gateway");
            expect(errors.length).to.equal(0);
        });
    });

    describe('deploy', function () {
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
            let uploadDeployableArtifactStub = sandbox.stub(deployPhaseCommon, 'uploadDeployableArtifactToHandelBucket').returns(Promise.resolve({
                Bucket: "FakeBucket",
                Key: "FakeKey"
            }));
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'RestApiId',
                    OutputValue: 'someApiId'
                }]
            }));

            return swaggerDeployType.deploy("FakeStack", serviceContext, ownPreDeployContext, dependenciesDeployContexts, "API Gateway")
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(uploadDeployableArtifactStub.callCount).to.equal(3); //Should be 3
                    expect(deployStackStub.callCount).to.equal(1);
                });
        });
    });
});
