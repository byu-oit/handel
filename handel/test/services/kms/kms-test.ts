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
import * as kms from '../../../src/services/kms';
import { KmsServiceConfig } from '../../../src/services/kms/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('kms deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<KmsServiceConfig>;
    let serviceParams: KmsServiceConfig;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        serviceParams = {
            type: 'kms'
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'kms'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        /*
         * Alias names must:
         *  - not start with 'AWS'
         *  - contain only alphanumeric characters, '/', '_', or '-'
         */
        describe('alias name', () => {
            it('should not allow keys starting with "AWS"', () => {
                serviceContext.params.alias = 'AWS-mykey';
                const errors = kms.check(serviceContext, []);
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.contain('\'alias\' parameter must not begin with \'AWS\'');
            });

            describe('character restrictions', () => {
                const badChars = ['funkychar$', 'bad\\slash', 'has spaces'];

                badChars.forEach(bad => {
                    it(`should reject '${bad}'`, () => {
                        serviceContext.params.alias = bad;
                        const errors = kms.check(serviceContext, []);
                        expect(errors).to.have.lengthOf(1);
                        expect(errors[0]).to.contain('\'alias\' parameter must only contain alphanumeric characters, dashes (\'-\'), underscores (\'_\'), or slashes (\'/\')');
                    });
                });
            });
        });

        it('should work when there are no configuration errors', () => {
            const errors = kms.check(serviceContext, []);
            expect(errors.length).to.equal(0);
        });

    });

    describe('deploy', () => {
        const alias = 'myalias';
        const keyId = '123ABC';
        const keyArn = 'arn:aws:kms:us-west-2:000000000000:key/' + keyId;

        it('should create the key', async () => {
            serviceContext.params = {
                type: 'kms',
                alias
            };
            const preDeployContext = new PreDeployContext(serviceContext);

            const deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').resolves({
                Outputs: [{
                    OutputKey: 'KeyId',
                    OutputValue: keyId
                }, {
                    OutputKey: 'KeyArn',
                    OutputValue: keyArn
                }, {
                    OutputKey: 'AliasName',
                    OutputValue: 'alias/' + alias
                }, {
                    OutputKey: 'AliasArn',
                    OutputValue: 'arn:aws:kms:us-west-2:000000000:alias/' + alias
                }]
            });

            const deployContext = await kms.deploy(serviceContext, preDeployContext, []);
            expect(deployStackStub.callCount).to.equal(1);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.policies).to.have.lengthOf(1);
            expect(deployContext.environmentVariables.FAKESERVICE_KEY_ID).to.equal(keyId);
            expect(deployContext.environmentVariables.FAKESERVICE_KEY_ARN).to.equal(keyArn);
            expect(deployContext.environmentVariables.FAKESERVICE_ALIAS_NAME).to.equal('alias/' + alias);
            expect(deployContext.environmentVariables.FAKESERVICE_ALIAS_ARN).to.equal('arn:aws:kms:us-west-2:000000000:alias/' + alias);
        });

        it('should create a default alias if none is specified', async () => {
            const aliasToUse = `alias/${appName}/${envName}/FakeService`;
            const aliasArn = 'arn:aws:kms:us-west-2:000000000:' + aliasToUse;
            const deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').resolves({
                Outputs: [{
                    OutputKey: 'KeyId',
                    OutputValue: keyId
                }, {
                    OutputKey: 'KeyArn',
                    OutputValue: keyArn
                }, {
                    OutputKey: 'AliasName',
                    OutputValue: aliasToUse
                }, {
                    OutputKey: 'AliasArn',
                    OutputValue: aliasArn
                }]
            });

            const preDeployContext = new PreDeployContext(serviceContext);

            const deployContext = await kms.deploy(serviceContext, preDeployContext, []);
            expect(deployStackStub.callCount).to.equal(1);

            expect(deployStackStub.firstCall.args[1]).to.contain('AliasName: ' + aliasToUse);

            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.policies).to.have.lengthOf(1);
            expect(deployContext.environmentVariables.FAKESERVICE_ALIAS_NAME).to.equal(aliasToUse);
            expect(deployContext.environmentVariables.FAKESERVICE_ALIAS_ARN).to.equal(aliasArn);
        });

        it('should set auto_rotate to true if not specified', async () => {
            const aliasToUse = `alias/${appName}/${envName}/FakeService`;
            const aliasArn = 'arn:aws:kms:us-west-2:000000000:' + aliasToUse;
            const deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').resolves({
                Outputs: [{
                    OutputKey: 'KeyId',
                    OutputValue: keyId
                }, {
                    OutputKey: 'KeyArn',
                    OutputValue: keyArn
                }, {
                    OutputKey: 'AliasName',
                    OutputValue: aliasToUse
                }, {
                    OutputKey: 'AliasArn',
                    OutputValue: aliasArn
                }]
            });

            const preDeployContext = new PreDeployContext(serviceContext);

            const deployContext = await kms.deploy(serviceContext, preDeployContext, []);
            expect(deployStackStub.callCount).to.equal(1);

            expect(deployStackStub.firstCall.args[1]).to.contain('EnableKeyRotation: true');
        });

    });

    describe('unDeploy', () => {
        it('should undeploy the stack', async () => {
            const unDeployStackStub = sandbox.stub(extensionSupport.deletePhases, 'unDeployService').resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await kms.unDeploy(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStackStub.callCount).to.equal(1);
        });
    });
});
