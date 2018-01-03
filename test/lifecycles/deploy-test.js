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
const deployLifecycle = require('../../dist/lifecycles/deploy');
const bindPhase = require('../../dist/phases/bind');
const deployPhase = require('../../dist/phases/deploy');
const preDeployPhase = require('../../dist/phases/pre-deploy');
const checkPhase = require('../../dist/phases/check');
const PreDeployContext = require('../../dist/datatypes').PreDeployContext;
const util = require('../../dist/common/util');
const sinon = require('sinon');
const expect = require('chai').expect;
const handelFileParser = require('../../dist/handelfile/parser-v1');

describe('deploy lifecycle module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('deploy', function () {
        it('should deploy the application environment on success', function () {
            let checkServicesStub = sandbox.stub(checkPhase, 'checkServices').returns([]);
            let preDeployServicesStub = sandbox.stub(preDeployPhase, 'preDeployServices').returns(Promise.resolve({
                A: new PreDeployContext({}),
                B: new PreDeployContext({})
            }));
            let bindServicesInLevelStub = sandbox.stub(bindPhase, 'bindServicesInLevel').returns({});
            let deployServicesInlevelStub = sandbox.stub(deployPhase, 'deployServicesInLevel').returns({});
            let handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
            let serviceDeployers = util.getServiceDeployers();
            return deployLifecycle.deploy(`${__dirname}/../test-account-config.yml`, handelFile, ["dev", "prod"], handelFileParser, serviceDeployers)
                .then(results => {
                    expect(checkServicesStub.calledTwice).to.be.true;
                    expect(preDeployServicesStub.calledTwice).to.be.true;
                    expect(bindServicesInLevelStub.callCount).to.equal(4);
                    expect(deployServicesInlevelStub.callCount).to.equal(4);
                });
        });
    });
});
