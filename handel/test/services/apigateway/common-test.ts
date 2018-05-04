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
import * as common from '../../../src/services/apigateway/common';
import { APIGatewayConfig } from '../../../src/services/apigateway/config-types';
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
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'FakeType'), {type: 'FakeType', swagger: 'FakeSwagger'}, accountConfig);
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
});
