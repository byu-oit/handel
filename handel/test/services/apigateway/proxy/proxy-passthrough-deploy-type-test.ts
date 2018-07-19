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
import {expect} from 'chai';
import { AccountConfig, DeployContext, PreDeployContext, ServiceContext, ServiceType } from 'handel-extension-api';
import { deployPhase } from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../../src/account-config/account-config';
import * as route53 from '../../../../src/aws/route53-calls';
import * as common from '../../../../src/services/apigateway/common';
import {APIGatewayConfig} from '../../../../src/services/apigateway/config-types';
import * as proxyPassthroughDeployType from '../../../../src/services/apigateway/proxy/proxy-passthrough-deploy-type';
import { STDLIB_PREFIX } from '../../../../src/services/stdlib';

describe('apigateway proxy deploy type', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<APIGatewayConfig>;
    let serviceParams: APIGatewayConfig;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'apigateway',
            proxy: {
                path_to_code: '.',
                handler: 'index.handler',
                runtime: 'nodejs6.10'
            }
        };
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 'FakeType'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should require the \'path_to_code\' param', () => {
            delete serviceContext.params.proxy!.path_to_code;
            const errors = proxyPassthroughDeployType.check(serviceContext, [], 'API Gateway');
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('\'path_to_code\' parameter is required');
        });

        it('should require the \'runtime\' param', () => {
            delete serviceContext.params.proxy!.runtime;
            const errors = proxyPassthroughDeployType.check(serviceContext, [], 'API Gateway');
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('\'runtime\' parameter is required');
        });

        it('should require the \'handler\' param', () => {
            delete serviceContext.params.proxy!.handler;
            const errors = proxyPassthroughDeployType.check(serviceContext, [], 'API Gateway');
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('\'handler\' parameter is required');
        });

        it('should check the \'warmup\' param', () => {
            serviceContext.params.proxy!.warmup = {
                schedule: 'rate(5 minutes)'
            };

            const checkStub = sandbox.stub(common, 'checkWarmupConfig').returns([]);

            const errors = proxyPassthroughDeployType.check(serviceContext, [], 'API Gateway');
            expect(errors.length).to.equal(0);

            expect(checkStub.callCount).to.equal(1);
        });

    });

    describe('deploy', () => {
        function getDependencyDeployContexts(appName: string, envName: string) {
            const dependenciesDeployContexts = [];
            const dependencyServiceName = 'DependencyService';
            const dependencyServiceType = 'dynamodb';
            const dependencyServiceParams = {
                type: dependencyServiceType
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
            const bucketName = 'FakeBucket';
            const bucketKey = 'FakeBucketKey';
            const uploadDeployableArtifactToHandelBucketStub = sandbox.stub(deployPhase, 'uploadDeployableArtifactToHandelBucket').resolves({
                Bucket: bucketName,
                Key: bucketKey
            });
            const deployStackStub = sandbox.stub(deployPhase, 'deployCloudFormationStack').resolves({
                Outputs: [{
                    OutputKey: 'RestApiId',
                    OutputValue: 'someApiId'
                }]
            });

            const deployContext = await proxyPassthroughDeployType.deploy('FakeStack', serviceContext, ownPreDeployContext, dependenciesDeployContexts, 'API Gateway');
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(uploadDeployableArtifactToHandelBucketStub.callCount).to.equal(1);
            expect(deployStackStub.callCount).to.equal(1);
        });

        it('should deploy custom domains', async () => {
             // Set up input parameters
            const ownPreDeployContext = new PreDeployContext(serviceContext);
            const dependenciesDeployContexts = getDependencyDeployContexts('FakeApp', 'FakeEnv');

            serviceContext.params.custom_domains = [
                {
                    dns_name: 'api.example.com',
                    https_certificate: 'arn:fake'
                },
                {
                    dns_name: 'api.mycompany.com',
                    https_certificate: 'arn:fake2'
                }
            ];

            // Stub out dependent services
            const bucketName = 'FakeBucket';
            const bucketKey = 'FakeBucketKey';
            const uploadDeployableArtifactToHandelBucketStub = sandbox.stub(deployPhase, 'uploadDeployableArtifactToHandelBucket').resolves({
                Bucket: bucketName,
                Key: bucketKey
            });
            const deployStackStub = sandbox.stub(deployPhase, 'deployCloudFormationStack').resolves({
                Outputs: [{
                    OutputKey: 'RestApiId',
                    OutputValue: 'someApiId'
                }]
            });

            const route53stub = sandbox.stub(route53, 'listHostedZones').resolves([
                {
                    Id: '1',
                    Name: 'example.com.'
                },
                {
                    Id: '2',
                    Name: 'api.mycompany.com.'
                }
            ]);

            const deployContext = await proxyPassthroughDeployType.deploy('FakeStack', serviceContext, ownPreDeployContext, dependenciesDeployContexts, 'API Gateway');
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(uploadDeployableArtifactToHandelBucketStub.callCount).to.equal(1);
            expect(deployStackStub.callCount).to.equal(1);
            const cloudformation = deployStackStub.firstCall.args[2];
            expect(cloudformation).to.contain('CustomDomainApiExampleCom');
            expect(cloudformation).to.contain('CustomDomainApiMycompanyCom');
        });

        it('should prewarm warm-able lambdas', async () => {
            // Set up input parameters
            const ownPreDeployContext = new PreDeployContext(serviceContext);
            const dependenciesDeployContexts = getDependencyDeployContexts('FakeApp', 'FakeEnv');

            serviceContext.params.proxy!.warmup = {
                schedule: 'rate(5 minutes)'
            };

            // Stub out dependent services
            const bucketName = 'FakeBucket';
            const bucketKey = 'FakeBucketKey';
            const uploadDeployableArtifactToHandelBucketStub = sandbox.stub(deployPhase, 'uploadDeployableArtifactToHandelBucket').resolves({
                Bucket: bucketName,
                Key: bucketKey
            });
            const deployStackStub = sandbox.stub(deployPhase, 'deployCloudFormationStack').resolves({
                Outputs: [{
                    OutputKey: 'RestApiId',
                    OutputValue: 'someApiId'
                }]
            });
            const maybeWarmLambdaStub = sandbox.stub(common, 'preWarmLambda').resolves();

            const deployContext = await proxyPassthroughDeployType.deploy('FakeStack', serviceContext, ownPreDeployContext, dependenciesDeployContexts, 'API Gateway');
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(uploadDeployableArtifactToHandelBucketStub.callCount).to.equal(1);
            expect(deployStackStub.callCount).to.equal(1);

            expect(maybeWarmLambdaStub.callCount).to.equal(1);
        });
    });
});
