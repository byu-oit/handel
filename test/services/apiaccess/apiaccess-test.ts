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
import { expect } from 'chai';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import { AccountConfig, DeployContext, PreDeployContext, ServiceConfig, ServiceContext } from '../../../src/datatypes';
import * as apiaccess from '../../../src/services/apiaccess';
import { APIAccessConfig } from '../../../src/services/apiaccess';

describe('apiaccess deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<APIAccessConfig>;
    let serviceParams: APIAccessConfig;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'apiaccess',
            aws_services: [
                'organizations',
                'ec2'
            ]
        };
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'apiaccess', serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should require the aws_services parameter', () => {
            delete serviceContext.params.aws_services;
            const errors = apiaccess.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('\'aws_services\' parameter is required');
        });

        it('should require the provided aws_services to be from the supported list', () => {
            serviceContext.params.aws_services[0] = 'unknownservice';
            const errors = apiaccess.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('\'aws_service\' value \'unknownservice\' is not supported');
        });

        it('should work when there are no configuration errors', () => {
            const errors = apiaccess.check(serviceContext, []);
            expect(errors.length).to.equal(0);
        });
    });

    describe('deploy', () => {
        it('should return a deploy context with the given policies', async () => {
            const preDeployContext = new PreDeployContext(serviceContext);

            const deployContext = await apiaccess.deploy(serviceContext, preDeployContext, []);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.policies.length).to.equal(2);
        });
    });
});
