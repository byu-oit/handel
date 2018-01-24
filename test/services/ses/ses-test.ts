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
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as sesCalls from '../../../src/aws/ses-calls';
import { AccountConfig, DeployContext, PreDeployContext, ServiceContext } from '../../../src/datatypes';
import * as ses from '../../../src/services/ses';
import { SesServiceConfig } from '../../../src/services/ses/config-types';

describe('ses deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<SesServiceConfig>;
    let serviceParams: SesServiceConfig;
    let accountConfig: AccountConfig;
    const app = `FakeApp`;
    const env = `FakeEnv`;
    const service = 'FakeService';

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        serviceParams = {
            type: 'ses',
            address: 'user@example.com'
        };
        serviceContext = new ServiceContext(app, env, service, 'ses', serviceParams, accountConfig);
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it(`should require an address`, () => {
            delete serviceContext.params.address;
            const errors = ses.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`valid email address`);
        });
        it(`should require a valid email address`, () => {
            serviceContext.params.address = 'example.com';
            const errors = ses.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`valid email address`);
        });
        it(`should pass with a valid address`, () => {
            const errors = ses.check(serviceContext, []);
            expect(errors).to.deep.equal([]);
        });
    });

    describe('deploy', () => {
        it(`should attempt to verify email address`, async () => {
            const address = `user@example.com`;
            const identityArn = `arn:aws:ses:${accountConfig.region}:${accountConfig.account_id}:identity/${address}`;
            const ownPreDeployContext = new PreDeployContext(serviceContext);

            const verifyStub = sandbox.stub(sesCalls, 'verifyEmailAddress').returns(Promise.resolve());

            const deployContext = await ses.deploy(serviceContext, ownPreDeployContext, []);
            expect(verifyStub.callCount).to.equal(1);
            expect(deployContext).to.be.instanceof(DeployContext);

            const envPrefix = service.toUpperCase();

            // Should have exported 2 env vars
            expect(deployContext.environmentVariables).to.have.property(`${envPrefix}_EMAIL_ADDRESS`, address);
            expect(deployContext.environmentVariables).to.have.property(`${envPrefix}_IDENTITY_ARN`, identityArn);

            // Should have exported 1 policy
            expect(deployContext.policies.length).to.equal(1); // Should have exported one policy
            expect(deployContext.policies[0].Resource[0]).to.equal(identityArn);
        });
    });
});
