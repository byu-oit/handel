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
const common = require('../../../lib/services/apigateway/common');
const ServiceContext = require('../../../lib/datatypes/service-context');
const sinon = require('sinon');
const expect = require('chai').expect;
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');

const config = require('../../../lib/account-config/account-config');

describe('apigateway common module', function () {
    let sandbox;
    let serviceContext;
    let appName = "FakeApp";
    let envName = "FakeEnv";

    beforeEach(function () {
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext(appName, envName, "FakeService", "FakeType", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('getRestApiUrl', function () {
        it('should return the constructed URL from the CloudFormation stack', function () {
            let cfStack = {
                Outputs: [{
                    OutputKey: 'RestApiId',
                    OutputValue: 'fakeid'
                }]
            }

            let restApiUrl = common.getRestApiUrl(cfStack, serviceContext);
            expect(restApiUrl).to.equal("https://fakeid.execute-api.us-west-2.amazonaws.com/FakeEnv/")
        });
    });

    describe('getPolicyStatementsForLambdaRole', function () {
        it('should return the list of policy statements for the service role', function () {
            let getAppSecretsPolicyStub = sandbox.stub(deployPhaseCommon, 'getAppSecretsAccessPolicyStatements').returns([]);
            let getPolicyStatementsStub = sandbox.stub(deployPhaseCommon, 'getAllPolicyStatementsForServiceRole').returns(Promise.resolve([]))

            return common.getPolicyStatementsForLambdaRole(serviceContext, [])
                .then(statements => {
                    expect(statements).to.deep.equal([]);
                    expect(getAppSecretsPolicyStub.callCount).to.equal(1);
                    expect(getPolicyStatementsStub.callCount).to.equal(1);
                });
        });
    });
});
