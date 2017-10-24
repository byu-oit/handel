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
const ses = require('../../../lib/services/ses');
const sesCalls = require('../../../lib/aws/ses-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('ses deployer', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        const app = `FakeApp`;
        const env = `FakeEnv`;
        const service = `FakeService`;
        const serviceType = `ses`;

        it(`should require an address`, function () {
            const params = {};
            const serviceContext = new ServiceContext(app, env, service, serviceType, params, {});
            const errors = ses.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`valid email address`);
        });
        it(`should require a valid email address`, function () {
            const params = {
                address: `example.com`
            };
            const serviceContext = new ServiceContext(app, env, service, serviceType, params, {});
            const errors = ses.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`valid email address`);
        });
        it(`should pass with a valid address`, function () {
            const params = {
                address: 'user@example.com'
            };
            const serviceContext = new ServiceContext(app, env, service, serviceType, params, {});
            const errors = ses.check(serviceContext);
            expect(errors).to.deep.equal([]);
        });
    });

    describe('deploy', function () {
        const app = `FakeApp`;
        const env = `FakeEnv`;
        const service = `FakeService`;
        const serviceType = `ses`;

        const address = `user@example.com`;
        const account = 'fake account';
        const region = 'fake region';
        const identityArn = `arn:aws:ses:${region}:${account}:identity/${address}`

        const ownServiceContext = new ServiceContext(app, env, service, serviceType, {
            type: `ses`,
            address
        }, {});
        const ownPreDeployContext = new PreDeployContext(ownServiceContext);

        ownServiceContext.accountConfig = {account_id: account, region};

        it(`should attempt to verify email address`, function () {
            const verifyStub = sandbox.stub(sesCalls, 'verifyEmailAddress').returns(Promise.resolve());

            return ses.deploy(ownServiceContext, ownPreDeployContext, [])
                .then(deployContext => {
                    expect(verifyStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);

                    const envPrefix = service.toUpperCase();

                    // Should have exported 2 env vars
                    expect(deployContext.environmentVariables).to.have.property(`${envPrefix}_EMAIL_ADDRESS`, address);
                    expect(deployContext.environmentVariables).to.have.property(`${envPrefix}_IDENTITY_ARN`, identityArn);

                    // Should have exported 1 policy
                    expect(deployContext.policies.length).to.equal(1); //Should have exported one policy
                    expect(deployContext.policies[0].Resource[0]).to.equal(identityArn);
                });
        });
    });
});
