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
const deleteLifecycle = require('../../dist/lifecycles/delete');
const unDeployPhase = require('../../dist/phases/un-deploy');
const unPreDeployPhase = require('../../dist/phases/un-pre-deploy');
const unBindPhase = require('../../dist/phases/un-bind');
const UnPreDeployContext = require('../../dist/datatypes/un-pre-deploy-context').UnPreDeployContext;
const util = require('../../dist/common/util');
const sinon = require('sinon');
const expect = require('chai').expect;
const handelFileParser = require('../../dist/handelfile/parser-v1');

describe('delete lifecycle module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('delete', function () {
        it('should delete the application environment', function () {
            let unDeployServicesStub = sandbox.stub(unDeployPhase, 'unDeployServicesInLevel').returns({});
            let unBindServicesStub = sandbox.stub(unBindPhase, 'unBindServicesInLevel').returns({});
            let unPreDeployStub = sandbox.stub(unPreDeployPhase, 'unPreDeployServices').returns(Promise.resolve({
                A: new UnPreDeployContext({})
            }));
            let serviceDeployers = util.getServiceDeployers();
            let handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
            return deleteLifecycle.delete(`${__dirname}/../test-account-config.yml`, handelFile, "dev", handelFileParser, serviceDeployers)
                .then(results => {
                    expect(unPreDeployStub.callCount).to.equal(1);
                    expect(unBindServicesStub.callCount).to.equal(2);
                    expect(unDeployServicesStub.callCount).to.equal(2);
                });
        });
    });
});
