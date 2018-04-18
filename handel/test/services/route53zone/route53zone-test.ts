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
    UnDeployContext
} from 'handel-extension-api';
import * as extensionSupport from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as deployPhaseCommon from '../../../src/common/deploy-phase-common';
import * as route53 from '../../../src/services/route53zone';
import { Route53ZoneServiceConfig } from '../../../src/services/route53zone/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('route53zone deployer', () => {
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<Route53ZoneServiceConfig>;
    let serviceParams: Route53ZoneServiceConfig;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'route53zone',
            name: 'somename.byu.edu'
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'route53'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should require the name parameter', () => {
            delete serviceParams.name;
            const errors = route53.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('\'name\' parameter must be specified');
        });

        describe('should fail if name is not a valid DNS hostname', () => {
            const invalidNames = ['-abc.def', 'abc-.def', 'ab c.def', 'has_underscores.com'];
            const validNames = ['0.a.mixed-123-chars'];

            invalidNames.forEach((invalid) => {
                it(`should reject '${invalid}'`, () => {
                    serviceContext.params.name = invalid;

                    const errors = route53.check(serviceContext, []);
                    expect(errors.length).to.equal(1);
                    expect(errors[0]).to.contain('\'name\' parameter must be a valid hostname');
                });
            });

            validNames.forEach((valid) => {
                it(`should accept '${valid}'`, () => {
                    serviceContext.params.name = valid;

                    const errors = route53.check(serviceContext, []);
                    expect(errors.length).to.equal(0);
                });
            });

        });

        it('should work when there are no configuration errors', () => {
            const errors = route53.check(serviceContext, []);
            expect(errors.length).to.equal(0);
        });
    });

    describe('deploy', () => {
        const dnsName = 'myapp.byu.edu';
        const zoneId = '123ABC';
        const zoneNameServers = 'ns1.amazonaws.com,ns2.amazonaws.co.uk';
        let preDeployContext: PreDeployContext;

        beforeEach(() => {
            serviceContext.params.name = dnsName;
            preDeployContext = new PreDeployContext(serviceContext);
        });

        it('should deploy the hosted zone', async () => {
            const deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').resolves({
                Outputs: [{
                    OutputKey: 'ZoneName',
                    OutputValue: dnsName
                }, {
                    OutputKey: 'ZoneId',
                    OutputValue: zoneId
                }, {
                    OutputKey: 'ZoneNameServers',
                    OutputValue: zoneNameServers
                }]
            });

            const deployContext = await route53.deploy(serviceContext, preDeployContext, []);
            expect(deployStackStub.callCount).to.equal(1);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.policies.length).to.equal(0);
            expect(deployContext.environmentVariables.FAKESERVICE_ZONE_NAME).to.equal(dnsName);
            expect(deployContext.environmentVariables.FAKESERVICE_ZONE_ID).to.equal(zoneId);
            expect(deployContext.environmentVariables.FAKESERVICE_ZONE_NAME_SERVERS).to.equal(zoneNameServers);
        });

        it('can deploy private zones', async () => {
            const deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'ZoneName',
                    OutputValue: dnsName
                }, {
                    OutputKey: 'ZoneId',
                    OutputValue: zoneId
                }, {
                    OutputKey: 'ZoneNameServers',
                    OutputValue: zoneNameServers
                }]
            }));

            serviceContext.params.name = dnsName;
            serviceContext.params.private = true;

            const deployContext = await route53.deploy(serviceContext, preDeployContext, []);
            expect(deployStackStub.callCount).to.equal(1);

            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.policies.length).to.equal(0);
            expect(deployContext.environmentVariables.FAKESERVICE_ZONE_NAME).to.equal(dnsName);
            expect(deployContext.environmentVariables.FAKESERVICE_ZONE_ID).to.equal(zoneId);
            expect(deployContext.environmentVariables.FAKESERVICE_ZONE_NAME_SERVERS).to.equal(zoneNameServers);
        });
    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(extensionSupport.deletePhases, 'unDeployService').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            const unDeployContext = await route53.unDeploy(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
