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
const rdsDeployersCommon = require('../../lib/common/rds-deployers-common');
const ssmCalls = require('../../lib/aws/ssm-calls');
const ServiceContext = require('../../lib/datatypes/service-context');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('RDS deployers common module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('getDeployContext', function () {
        it('should return the RDS deploy context from the service context and deployed stack', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", {});
            let dbAddress = "FakeAddress";
            let dbPort = 55555;
            let dbUsername = "FakeUsername";
            let dbName = "FakeDbName";

            let rdsCfStack = {
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
            }

            let deployContext = rdsDeployersCommon.getDeployContext(serviceContext, rdsCfStack);
            expect(deployContext.environmentVariables['FAKESERVICE_ADDRESS']).to.equal(dbAddress);
            expect(deployContext.environmentVariables['FAKESERVICE_PORT']).to.equal(dbPort);
            expect(deployContext.environmentVariables['FAKESERVICE_DATABASE_NAME']).to.equal(dbName);
        });
    });

    describe('addDbCredentialToParameterStore', function() {
        it('should store the database password to the parameter store', function() {
            let storeParamStub = sandbox.stub(ssmCalls, 'storeParameter').returns(Promise.resolve(true));

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", {});
            return rdsDeployersCommon.addDbCredentialToParameterStore(serviceContext, 'FakeUsername', 'FakePassword', {})
                .then(deployedStack => {
                    expect(deployedStack).to.deep.equal({});
                    expect(storeParamStub.callCount).to.equal(2);
                });
        });
    });

    describe('deleteParametersFromParameterStore', function() {
        it('should delete the RDS parameters from the parameter store', function() {
            let deleteParamsStub = sandbox.stub(ssmCalls, 'deleteParameters').returns(Promise.resolve(true));

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", {});
            return rdsDeployersCommon.deleteParametersFromParameterStore(serviceContext, {})
                .then(unDeployContext => {
                    expect(unDeployContext).to.deep.equal({});
                    expect(deleteParamsStub.callCount).to.equal(1);
                });
        });
    });
});