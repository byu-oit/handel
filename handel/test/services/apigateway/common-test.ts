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
import { AccountConfig, ServiceContext, ServiceType } from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as lambdaCalls from '../../../src/aws/lambda-calls';
import * as common from '../../../src/services/apigateway/common';
import { APIGatewayConfig, WarmupConfig } from '../../../src/services/apigateway/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('apigateway common module', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<APIGatewayConfig>;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'FakeType'), {
            type: 'FakeType',
            swagger: 'FakeSwagger'
        }, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getRestApiUrl', () => {
        it('should return the constructed URL from the CloudFormation stack', () => {
            const cfStack = {
                StackName: 'FakeStack',
                CreationTime: new Date(),
                StackStatus: 'CREATE_COMPLETE',
                Outputs: [{
                    OutputKey: 'RestApiId',
                    OutputValue: 'fakeid'
                }]
            };

            const restApiUrl = common.getRestApiUrl(cfStack, serviceContext);
            expect(restApiUrl).to.equal('https://fakeid.execute-api.us-west-2.amazonaws.com/FakeEnv/');
        });
    });

    describe('getPolicyStatementsForLambdaRole', () => {
        it('should return the list of policy statements for the service role', async () => {
            const statements = await common.getPolicyStatementsForLambdaRole(serviceContext, []);
            expect(statements.length).to.equal(4);
        });
    });

    describe('checkWarmupConfig', () => {
        describe('valid configs', () => {
            const configs = {
                'rate schedule': {
                    schedule: 'rate(5 minutes)'
                },
                'cron schedule': {
                    schedule: 'cron(0 10 * * ? *)'
                },
                'http paths': {
                    schedule: 'rate(5 minutes)',
                    http_paths: [
                        '/warmup'
                    ]
                }
            };

            Object.entries(configs).forEach(([name, thisConfig]) => {
                it(`allows a valid ${name} config`, () => {
                    const errors = common.checkWarmupConfig(thisConfig);
                    expect(errors).to.be.empty;
                });
            });

        });

        it(`fails if 'schedule' is missing`, () => {
            const conf = {};

            const errors = common.checkWarmupConfig(conf as WarmupConfig);

            expect(errors).to.have.lengthOf(1);
            expect(errors[0]).to.include(`'warmup' is missing the 'schedule' parameter`);
        });
        it(`fails if 'schedule' is invalid`, () => {
            const conf = {
                schedule: 'something invalid()'
            };

            const errors = common.checkWarmupConfig(conf as WarmupConfig);

            expect(errors).to.have.lengthOf(1);
            expect(errors[0]).to.include(`Invalid warmup schedule expression`);
        });
        it(`fails if 'http_paths' is not an array`, () => {
            const conf: any = {
                schedule: 'rate(5 minutes)',
                http_paths: 'hi'
            };

            const errors = common.checkWarmupConfig(conf as WarmupConfig);

            expect(errors).to.have.lengthOf(1);
            expect(errors[0]).to.include(`'warmup.http_paths' must be an array`);
        });
        it(`fails if 'http_paths' has more than 5 values`, () => {
            const conf: any = {
                schedule: 'rate(5 minutes)',
                http_paths: [
                    '/1',
                    '/2',
                    '/3',
                    '/4',
                    '/5',
                    '/6',
                ]
            };

            const errors = common.checkWarmupConfig(conf as WarmupConfig);

            expect(errors).to.have.lengthOf(1);
            expect(errors[0]).to.include(`maximum of 5 values`);
        });
    });

    describe('preWarmLambda', () => {
        it('handles default cloudwatch event', async () => {
            const warmupConfig: WarmupConfig = {
                schedule: 'rate(5 minutes)',
            };

            const invokeStub = sandbox.stub(lambdaCalls, 'invokeLambda').resolves({});

            await common.preWarmLambda(serviceContext, warmupConfig, 'lambdaName', 'abc123');

            expect(invokeStub.callCount).to.equal(1);
            expect(invokeStub.firstCall.args).to.have.lengthOf(2);

            const [name, event] = invokeStub.firstCall.args;

            expect(name).to.equal('lambdaName');
            expect(event).to.include({
                'detail-type': 'Scheduled Event',
                source: 'aws.events',
            });
        });
        it('handles HTTP warmups', async () => {
            const warmupConfig: WarmupConfig = {
                schedule: 'rate(5 minutes)',
                http_paths: [
                    '/warmup'
                ],
            };

            const invokeStub = sandbox.stub(lambdaCalls, 'invokeLambda').resolves({});

            await common.preWarmLambda(serviceContext, warmupConfig, 'lambdaName', 'abc123');

            expect(invokeStub.callCount).to.equal(1);
            expect(invokeStub.firstCall.args).to.have.lengthOf(2);

            const [name, event] = invokeStub.firstCall.args;

            expect(name).to.equal('lambdaName');
            expect(event).to.include({
                path: '/warmup',
                httpMethod: 'GET'
            });
        });
    });

    describe('getWarmupTemplateParameters', () => {
        it('handles a plain schedule', () => {
            const conf = {
                schedule: 'rate(5 minutes)'
            };
            const result = common.getWarmupTemplateParameters(conf, serviceContext, 'RestApiId');
            expect(result).to.have.property('schedule', 'rate(5 minutes)');
        });
        it('handles HTTP path mappings', () => {
            const conf = {
                schedule: 'rate(5 minutes)',
                http_paths: [
                    '/path?a=b&c=d'
                ]
            };
            const result = common.getWarmupTemplateParameters(conf, serviceContext, 'RestApiId');
            expect(result).to.have.property('httpPaths')
                .which.is.an('array')
                .and.has.lengthOf(1);

            const paths = result.httpPaths;
            expect(paths[0]).to.have.property('path', '/path?a=b&c=d');
            expect(paths[0]).to.have.property('eventBody')
                .which.is.a('string');

            const eventBody = JSON.parse(JSON.parse(paths[0].eventBody));
            expect(eventBody).to.deep.include({
                path: '/path',
                queryStringParameters: {
                    a: 'b', c: 'd'
                }
            });
            expect(eventBody).to.haveOwnProperty('requestContext')
                .which.includes({
                apiId: '${RestApiId}'
            });
        });
    });

    describe('createApiGatewayProxyEventBody', () => {
        it('should return a JSON object with the event body', () => {
            const path = '/hi/there';

            const result = common.createApiGatewayProxyEventBody(
                path,
                '123abc',
                'dev',
                serviceContext
            );

            expect(result).to.deep.include({
                httpMethod: 'GET',
                path: path,
                queryStringParameters: null,
                pathParameters: {
                    proxy: 'hi/there'
                },
                body: null
            });
        });
        it('handles query params properly', () => {
            const result = common.createApiGatewayProxyEventBody(
                '/hi/there?a=b&c=d',
                '123abc',
                'dev',
                serviceContext
            );

            expect(result).to.deep.include({
                httpMethod: 'GET',
                path: '/hi/there',
                queryStringParameters: {
                    a: 'b',
                    c: 'd',
                },
                pathParameters: {
                    proxy: 'hi/there'
                },
                body: null
            });
        });
        it('handles missing initial slash', () => {
            const result = common.createApiGatewayProxyEventBody(
                'hi/there',
                '123abc',
                'dev',
                serviceContext
            );

            expect(result).to.deep.include({
                httpMethod: 'GET',
                path: '/hi/there',
                queryStringParameters: null,
                pathParameters: {
                    proxy: 'hi/there'
                },
                body: null
            });
        });
    });

    describe('createCloudwatchScheduledEventBody', () => {
        it('should return a scheduled event body', () => {
            const result = common.createCloudwatchScheduledEventBody(serviceContext);

            expect(result).to.deep.include({
                version: '0',
                'detail-type': 'Scheduled Event',
                source: 'aws.events',
                account: accountConfig.account_id,
                region: accountConfig.region,
                resources: [
                    'handel-warmup'
                ]
            });
        });
    });

});
