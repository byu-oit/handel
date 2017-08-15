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
const accountConfig = require('../../../lib/common/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const route53 = require('../../../lib/services/route53zone');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const bindPhaseCommon = require('../../../lib/common/bind-phase-common');
const preDeployPhaseCommon = require('../../../lib/common/pre-deploy-phase-common');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const UnBindContext = require('../../../lib/datatypes/un-bind-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('route53zone deployer', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require the name parameter', function () {
            let serviceContext = {
                params: {}
            };

            let errors = route53.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'name' parameter must be specified");
        });

        describe('should fail if name is not a valid DNS hostname', function () {
            let invalidNames = ['-abc.def', 'abc-.def', 'ab c.def', 'has_underscores.com'];
            let validNames = ['0.a.mixed-123-chars'];

            invalidNames.forEach(function (invalid) {
                it(`should reject '${invalid}'`, function () {
                    let serviceContext = {
                        params: {
                            name: invalid
                        }
                    };

                    let errors = route53.check(serviceContext);
                    expect(errors.length).to.equal(1);
                    expect(errors[0]).to.contain("'name' parameter must be a valid hostname");
                });
            });

            validNames.forEach(function (valid) {
                it(`should accept '${valid}'`, function () {
                    let serviceContext = {
                        params: {
                            name: valid
                        }
                    };

                    let errors = route53.check(serviceContext);
                    expect(errors.length).to.be.empty;
                });
            });

        });

        it('should work when there are no configuration errors', function () {
            let serviceContext = {
                params: {
                    name: 'somename',
                    private: true
                }
            }
            let errors = route53.check(serviceContext);
            expect(errors.length).to.equal(0);
        });

        it('should fail if private is not a boolean', function () {
            let serviceContext = {
                params: {
                    name: 'somename',
                    private: 'foobar'
                }
            }
            let errors = route53.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'private' parameter must be 'true' or 'false'");
        });


    });

    describe('preDeploy', function () {
        it('should return an empty predeploy context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let preDeployNotRequiredStub = sandbox.stub(preDeployPhaseCommon, 'preDeployNotRequired').returns(Promise.resolve(new PreDeployContext(serviceContext)));

            return route53.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployNotRequiredStub.callCount).to.equal(1);
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                });
        });
    });

    describe('bind', function () {
        it('should return an empty bind context', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let bindNotRequiredStub = sandbox.stub(bindPhaseCommon, 'bindNotRequired').returns(Promise.resolve(new BindContext({}, {})));

            return route53.bind(serviceContext)
                .then(bindContext => {
                    expect(bindNotRequiredStub.callCount).to.equal(1);
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('deploy', function () {
        let appName = "FakeApp";
        let envName = "FakeEnv";
        let deployVersion = "1";
        let dnsName = "myapp.byu.edu";
        let zoneId = '123ABC';
        let zoneNameServers = 'ns1.amazonaws.com,ns2.amazonaws.co.uk';
        let serviceContext = new ServiceContext(appName, envName, "FakeService", "route53", deployVersion, {
            name: dnsName
        });
        let preDeployContext = new PreDeployContext(serviceContext);

        it('should deploy the hosted zone', function () {
            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
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

            return route53.deploy(serviceContext, preDeployContext, [])
                .then(deployContext => {
                    expect(deployStackStub.callCount).to.equal(1);
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.policies).to.be.empty;
                    expect(deployContext.environmentVariables["ROUTE53_FAKEAPP_FAKEENV_FAKESERVICE_ZONE_NAME"]).to.equal(dnsName);
                    expect(deployContext.environmentVariables["ROUTE53_FAKEAPP_FAKEENV_FAKESERVICE_ZONE_ID"]).to.equal(zoneId);
                    expect(deployContext.environmentVariables["ROUTE53_FAKEAPP_FAKEENV_FAKESERVICE_ZONE_NAME_SERVERS"]).to.equal(zoneNameServers);
                });
        });
    });

    describe('consumeEvents', function () {
        it('should return an error since it cant consume events', function () {
            return route53.consumeEvents(null, null, null, null)
                .then(() => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Route53 service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function () {
        it('should return an error since it doesnt yet produce events', function () {
            return route53.produceEvents(null, null, null, null)
                .then(() => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Route53 service doesn't currently produce events");
                });
        });
    });

    describe('unPreDeploy', function () {
        it('should return an empty UnPreDeploy context', function () {
            let unPreDeployNotRequiredStub = sandbox.stub(deletePhasesCommon, 'unPreDeployNotRequired').returns(Promise.resolve(new UnPreDeployContext({})));
            return route53.unPreDeploy({})
                .then(unPreDeployContext => {
                    expect(unPreDeployContext).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeployNotRequiredStub.callCount).to.equal(1);
                });
        });
    });

    describe('unBind', function () {
        it('should return an empty UnBind context', function () {
            let unBindNotRequiredStub = sandbox.stub(deletePhasesCommon, 'unBindNotRequired').returns(Promise.resolve(new UnBindContext({})));
            return route53.unBind({})
                .then(unBindContext => {
                    expect(unBindContext).to.be.instanceof(UnBindContext);
                    expect(unBindNotRequiredStub.callCount).to.equal(1);
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "route53", "1", {});
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return route53.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});
