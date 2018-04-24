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
    DeployContext,
    PreDeployContext,
    ServiceContext,
    ServiceType,
} from 'handel-extension-api';
import { deployPhase } from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../../src/account-config/account-config';
import * as deployPhaseCommon from '../../../../src/common/deploy-phase-common';
import { APIGatewayConfig } from '../../../../src/services/apigateway/config-types';
import * as swaggerDeployType from '../../../../src/services/apigateway/swagger/swagger-deploy-type';
import { STDLIB_PREFIX } from '../../../../src/services/stdlib';

describe('apigateway swagger deploy type', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<APIGatewayConfig>;
    let serviceParams: APIGatewayConfig;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'apigateway',
            swagger: `${__dirname}/test-swagger.json`
        };
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 'FakeType'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should not check anything yet', () => {
            const errors = swaggerDeployType.check(serviceContext, [], 'API Gateway');
            expect(errors.length).to.equal(0);
        });
    });

    describe('deploy', () => {
        function getDependencyDeployContexts(appName: string, envName: string) {
            const dependenciesDeployContexts = [];
            const dependencyServiceName = 'DependencyService';
            const dependencyServiceType = 'dynamodb';
            const dependencyServiceParams = {
                type: 'dynamodb'
            };
            const dependencyServiceContext = new ServiceContext(appName, envName, dependencyServiceName, new ServiceType(STDLIB_PREFIX, dependencyServiceType), dependencyServiceParams, accountConfig);
            const dependencyDeployContext = new DeployContext(dependencyServiceContext);
            dependenciesDeployContexts.push(dependencyDeployContext);
            return dependenciesDeployContexts;
        }

        it('should deploy the service', async () => {
            // Set up input parameters
            const ownPreDeployContext = new PreDeployContext(serviceContext);
            const dependenciesDeployContexts = getDependencyDeployContexts('FakeApp', 'FakeEnv');

            // Stub out dependent services
            const uploadDeployableArtifactStub = sandbox.stub(deployPhase, 'uploadDeployableArtifactToHandelBucket').resolves({
                Bucket: 'FakeBucket',
                Key: 'FakeKey'
            });
            const deployStackStub = sandbox.stub(deployPhase, 'deployCloudFormationStack').resolves({
                Outputs: [{
                    OutputKey: 'RestApiId',
                    OutputValue: 'someApiId'
                }]
            });

            const deployContext = await swaggerDeployType.deploy('FakeStack', serviceContext, ownPreDeployContext, dependenciesDeployContexts, 'API Gateway');
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(uploadDeployableArtifactStub.callCount).to.equal(3); // Should be 3
            expect(deployStackStub.callCount).to.equal(1);
        });
    });
});
