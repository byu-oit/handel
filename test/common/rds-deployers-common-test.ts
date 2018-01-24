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
import config from '../../src/account-config/account-config';
import * as ssmCalls from '../../src/aws/ssm-calls';
import * as rdsDeployersCommon from '../../src/common/rds-deployers-common';
import { AccountConfig, ServiceConfig, ServiceContext, UnDeployContext } from '../../src/datatypes';

describe('RDS deployers common module', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getDeployContext', () => {
        it('should return the RDS deploy context from the service context and deployed stack', () => {
            const serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', {type: 'FakeType'}, accountConfig);
            const dbAddress = 'FakeAddress';
            const dbPort = 55555;
            const dbUsername = 'FakeUsername';
            const dbName = 'FakeDbName';

            const rdsCfStack = {
                Outputs: [
                    {
                        OutputKey: 'DatabaseAddress',
                        OutputValue: dbAddress
                    },
                    {
                        OutputKey: 'DatabasePort',
                        OutputValue: dbPort
                    },
                    {
                        OutputKey: 'DatabaseName',
                        OutputValue: dbName
                    }
                ]
            };

            const deployContext = rdsDeployersCommon.getDeployContext(serviceContext, rdsCfStack);
            expect(deployContext.environmentVariables.FAKESERVICE_ADDRESS).to.equal(dbAddress);
            expect(deployContext.environmentVariables.FAKESERVICE_PORT).to.equal(dbPort);
            expect(deployContext.environmentVariables.FAKESERVICE_DATABASE_NAME).to.equal(dbName);
        });
    });

    describe('addDbCredentialToParameterStore', () => {
        it('should store the database password to the parameter store', async () => {
            const storeParamStub = sandbox.stub(ssmCalls, 'storeParameter').resolves(true);

            const serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', {type: 'FakeType'}, accountConfig);
            const deployedStack = await rdsDeployersCommon.addDbCredentialToParameterStore(serviceContext, 'FakeUsername', 'FakePassword', {});
            expect(deployedStack).to.deep.equal({});
            expect(storeParamStub.callCount).to.equal(2);
        });
    });

    describe('deleteParametersFromParameterStore', () => {
        it('should delete the RDS parameters from the parameter store', async () => {
            const deleteParamsStub = sandbox.stub(ssmCalls, 'deleteParameters').resolves(true);

            const serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', {type: 'FakeType'}, accountConfig);
            const unDeployContext = new UnDeployContext(serviceContext);
            const retUnDeployContext = await rdsDeployersCommon.deleteParametersFromParameterStore(serviceContext, unDeployContext);
            expect(retUnDeployContext).to.deep.equal(unDeployContext);
            expect(deleteParamsStub.callCount).to.equal(1);
        });
    });
});
