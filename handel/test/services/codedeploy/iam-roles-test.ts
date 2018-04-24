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
import { handlebars } from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as deployPhaseCommon from '../../../src/common/deploy-phase-common';
import { CodeDeployServiceConfig } from '../../../src/services/codedeploy/config-types';
import * as iamRoles from '../../../src/services/codedeploy/iam-roles';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('codedeploy asg-launchconfig config module', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<CodeDeployServiceConfig>;
    let serviceParams: CodeDeployServiceConfig;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        serviceParams = {
            type: 'codedeploy',
            path_to_code: '.',
            os: 'linux'
        };
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 'codedeploy'), serviceParams, accountConfig);
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getStatementsForInstanceRole', () => {
        it('should return the list of IAM statements needed for the instance role', async () => {
            const compileTemplateStub = sandbox.stub(handlebars, 'compileTemplate').resolves('[]');
            const getAppSecretsStatementStub = sandbox.stub(deployPhaseCommon, 'getAppSecretsAccessPolicyStatements').resolves([]);
            const getAllStatementsStub = sandbox.stub(deployPhaseCommon, 'getAllPolicyStatementsForServiceRole').resolves([]);

            const statements = await iamRoles.getStatementsForInstanceRole(serviceContext, []);
            expect(statements).to.deep.equal([]);
            expect(compileTemplateStub.callCount).to.equal(1);
            expect(getAppSecretsStatementStub.callCount).to.equal(1);
            expect(getAllStatementsStub.callCount).to.equal(1);
        });
    });

    describe('createCodeDeployServiceRoleIfNotExists', () => {
        it('should create the service role needed for codedeploy', async () => {
            const createRoleStub = sandbox.stub(deployPhaseCommon, 'createCustomRole').resolves({});

            const role = await iamRoles.createCodeDeployServiceRoleIfNotExists(serviceContext);
            expect(role).to.deep.equal({});
            expect(createRoleStub.callCount).to.equal(1);
        });
    });
});
