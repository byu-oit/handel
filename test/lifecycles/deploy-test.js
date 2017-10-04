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
const deployLifecycle = require('../../lib/lifecycles/deploy');
const bindPhase = require('../../lib/phases/bind');
const deployPhase = require('../../lib/phases/deploy');
const preDeployPhase = require('../../lib/phases/pre-deploy');
const checkPhase = require('../../lib/phases/check');
const PreDeployContext = require('../../lib/datatypes/pre-deploy-context');
const util = require('../../lib/common/util');
const sinon = require('sinon');
const expect = require('chai').expect;

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
            return deployLifecycle.deploy(`${__dirname}/../test-account-config.yml`, handelFile, ["dev", "prod"], "1")
                .then(results => {
                    expect(checkServicesStub.calledTwice).to.be.true;
                    expect(preDeployServicesStub.calledTwice).to.be.true;
                    expect(bindServicesInLevelStub.callCount).to.equal(4);
                    expect(deployServicesInlevelStub.callCount).to.equal(4);
                });
        });
    });
});
