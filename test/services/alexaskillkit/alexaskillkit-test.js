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
const alexaSkillKit = require('../../../lib/services/alexaskillkit');
const deployPhaseCommon = require('../../../lib/common/deploy-phase-common');
const ServiceContext = require('../../../lib/datatypes/service-context');
const deletePhasesCommon = require('../../../lib/common/delete-phases-common');
const preDeployPhaseCommon = require('../../../lib/common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../../lib/common/bind-phase-common');
const ProduceEventsContext = require('../../../lib/datatypes/produce-events-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const UnDeployContext = require('../../../lib/datatypes/un-deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const UnPreDeployContext = require('../../../lib/datatypes/un-pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const UnBindContext = require('../../../lib/datatypes/un-bind-context');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('alexaskillkit deployer', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should require the region to be us-east-1 or eu-west-1', function () {
            let serviceContext = {
                params: {}
            }
            let errors = alexaSkillKit.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("You must deploy to");
        });

        it('should work when the region is us-east-1 or eu-west-1', function () {
            let serviceContext = {
                params: {}
            }
            old_region = accountConfig.region
            accountConfig.region = 'us-east-1' //toggle region
            let errors = alexaSkillKit.check(serviceContext);
            accountConfig.region = old_region //reset the region
            expect(errors.length).to.equal(0);
        });
    });
});