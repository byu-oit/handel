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
const route53 = require('../../../lib/services/route53zone');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../../lib/account-config/account-config');

describe('route53zone deployer', function () {
    let appName = "FakeApp";
    let envName = "FakeEnv";
    let sandbox;
    let serviceContext;

    beforeEach(function () {
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext(appName, envName, "FakeService", "route53", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require the name parameter', function () {
            let errors = route53.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'name' parameter must be specified");
        });

        describe('should fail if name is not a valid DNS hostname', function () {
            let invalidNames = ['-abc.def', 'abc-.def', 'ab c.def', 'has_underscores.com'];
            let validNames = ['0.a.mixed-123-chars'];

            invalidNames.forEach(function (invalid) {
                it(`should reject '${invalid}'`, function () {
                    serviceContext.params = {
                        name: invalid
                    }

                    let errors = route53.check(serviceContext);
                    expect(errors.length).to.equal(1);
                    expect(errors[0]).to.contain("'name' parameter must be a valid hostname");
                });
            });

            validNames.forEach(function (valid) {
                it(`should accept '${valid}'`, function () {
                    serviceContext.params = {
                        name: valid
                    }

                    let errors = route53.check(serviceContext);
                    expect(errors.length).to.be.empty;
                });
            });

        });

        it('should work when there are no configuration errors', function () {
            serviceContext.params = {
                name: 'somename',
                private: true
            }
            let errors = route53.check(serviceContext);
            expect(errors.length).to.equal(0);
        });

        it('should fail if private is not a boolean', function () {
            serviceContext.params = {
                name: 'somename',
                private: 'foobar'
            }
            let errors = route53.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'private' parameter must be 'true' or 'false'");
        });
    });

    describe('deploy', function () {
        let dnsName = "myapp.byu.edu";
        let zoneId = '123ABC';
        let zoneNameServers = 'ns1.amazonaws.com,ns2.amazonaws.co.uk';
        let preDeployContext;

        beforeEach(function () {
            serviceContext.params = {
                dns_name: dnsName
            }
            preDeployContext = new PreDeployContext(serviceContext);
        });

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
                    expect(deployContext.environmentVariables["FAKESERVICE_ZONE_NAME"]).to.equal(dnsName);
                    expect(deployContext.environmentVariables["FAKESERVICE_ZONE_ID"]).to.equal(zoneId);
                    expect(deployContext.environmentVariables["FAKESERVICE_ZONE_NAME_SERVERS"]).to.equal(zoneNameServers);
                });
        });

        it('can deploy private zones', function () {
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

            serviceContext.params = {
                name: dnsName,
                private: true,
            }

            return route53.deploy(serviceContext, preDeployContext, [])
                .then(deployContext => {
                    expect(deployStackStub.callCount).to.equal(1);

                    expect(deployStackStub.firstCall.args[1]).to.contain(
                        `VPCs:
        - VPCId: ${serviceContext.accountConfig.vpc}
          VPCRegion: ${serviceContext.accountConfig.region}`);
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.policies).to.be.empty;
                    expect(deployContext.environmentVariables["FAKESERVICE_ZONE_NAME"]).to.equal(dnsName);
                    expect(deployContext.environmentVariables["FAKESERVICE_ZONE_ID"]).to.equal(zoneId);
                    expect(deployContext.environmentVariables["FAKESERVICE_ZONE_NAME_SERVERS"]).to.equal(zoneNameServers);
                });
        });
    });

    describe('unDeploy', function () {
        it('should undeploy the stack', function () {
            let unDeployStackStub = sandbox.stub(deletePhasesCommon, 'unDeployService').returns(Promise.resolve(new UnDeployContext(serviceContext)));

            return route53.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(unDeployStackStub.calledOnce).to.be.ture;
                });
        });
    });
});
