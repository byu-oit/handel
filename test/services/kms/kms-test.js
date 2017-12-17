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
const kms = require('../../../dist/services/kms');
const ServiceContext = require('../../../dist/datatypes/service-context').ServiceContext;
const DeployContext = require('../../../dist/datatypes/deploy-context').DeployContext;
const PreDeployContext = require('../../../dist/datatypes/pre-deploy-context').PreDeployContext;
const deployPhaseCommon = require('../../../dist/common/deploy-phase-common');
const deletePhasesCommon = require('../../../dist/common/delete-phases-common');
const UnDeployContext = require('../../../dist/datatypes/un-deploy-context').UnDeployContext;
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../../dist/account-config/account-config').default;

describe('kms deployer', function () {
    let sandbox;
    let serviceContext;
    let appName = "FakeApp";
    let envName = "FakeEnv";

    beforeEach(function () {
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext(appName, envName, "FakeService", "kms", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        /*
         * Alias names must:
         *  - not start with 'AWS'
         *  - contain only alphanumeric characters, '/', '_', or '-'
         */
        describe('alias name', function () {
            it('should not allow keys starting with "AWS"', function () {
                let errors = kms.check(ctx("AWS-mykey"));
                expect(errors).to.have.lengthOf(1);
                expect(errors[0]).to.contain("'alias' parameter must not begin with 'AWS'")
            });

            describe('character restrictions', function () {
                let badChars = ['funkychar$', 'bad\\slash', 'has spaces'];

                badChars.forEach(bad => {
                    it(`should reject '${bad}'`, function () {
                        let errors = kms.check(ctx(bad));
                        expect(errors).to.have.lengthOf(1);
                        expect(errors[0]).to.contain("'alias' parameter must only contain alphanumeric characters, dashes ('-'), underscores ('_'), or slashes ('/')")
                    });
                })
            });

            function ctx(name) {
                return {
                    params: {
                        alias: name
                    }
                }
            }
        });

        it('should work when there are no configuration errors', function () {
            let errors = kms.check(serviceContext);
            expect(errors).to.be.empty;
        });

    });

    describe('deploy', function () {
        let alias = 'myalias';
        let keyId = '123ABC';
        let keyArn = 'arn:aws:kms:us-west-2:000000000000:key/' + keyId;

        it('should create the key', function () {
            serviceContext.params = {
                alias
            }
            let preDeployContext = new PreDeployContext(serviceContext);

            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
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
            }));

            return kms.deploy(serviceContext, preDeployContext, [])
                .then(deployContext => {
                    expect(deployStackStub.callCount).to.equal(1);
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.policies).to.have.lengthOf(1);
                    expect(deployContext.environmentVariables["FAKESERVICE_KEY_ID"]).to.equal(keyId);
                    expect(deployContext.environmentVariables["FAKESERVICE_KEY_ARN"]).to.equal(keyArn);
                    expect(deployContext.environmentVariables["FAKESERVICE_ALIAS_NAME"]).to.equal('alias/' + alias);
                    expect(deployContext.environmentVariables["FAKESERVICE_ALIAS_ARN"]).to.equal('arn:aws:kms:us-west-2:000000000:alias/' + alias);
                });
        });

        it('should create a default alias if none is specified', function () {
            let alias = `alias/${appName}/${envName}/FakeService`;
            let aliasArn = 'arn:aws:kms:us-west-2:000000000:' + alias;
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'KeyId',
                    OutputValue: keyId
                }, {
                    OutputKey: 'KeyArn',
                    OutputValue: keyArn
                }, {
                    OutputKey: 'AliasName',
                    OutputValue: alias
                }, {
                    OutputKey: 'AliasArn',
                    OutputValue: aliasArn
                }]
            }));

            let preDeployContext = new PreDeployContext(serviceContext);

            return kms.deploy(serviceContext, preDeployContext, [])
                .then(deployContext => {
                    expect(deployStackStub.callCount).to.equal(1);

                    console.log(deployStackStub.firstCall.args);
                    expect(deployStackStub.firstCall.args[1]).to.contain('AliasName: ' + alias);

                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.policies).to.have.lengthOf(1);
                    expect(deployContext.environmentVariables["FAKESERVICE_ALIAS_NAME"]).to.equal(alias);
                    expect(deployContext.environmentVariables["FAKESERVICE_ALIAS_ARN"]).to.equal(aliasArn);
                });
        });


        it('should set auto_rotate to true if not specified', function () {
            let alias = `alias/${appName}/${envName}/FakeService`;
            let aliasArn = 'arn:aws:kms:us-west-2:000000000:' + alias;
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'KeyId',
                    OutputValue: keyId
                }, {
                    OutputKey: 'KeyArn',
                    OutputValue: keyArn
                }, {
                    OutputKey: 'AliasName',
                    OutputValue: alias
                }, {
                    OutputKey: 'AliasArn',
                    OutputValue: aliasArn
                }]
            }));

            let preDeployContext = new PreDeployContext(serviceContext);

            return kms.deploy(serviceContext, preDeployContext, [])
                .then(deployContext => {
                    expect(deployStackStub.callCount).to.equal(1);

                    expect(deployStackStub.firstCall.args[1]).to.contain('EnableKeyRotation: true');
                });
        });


    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return kms.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});
