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
const elasticacheDeployersCommon = require('../../dist/common/elasticache-deployers-common');
const ServiceContext = require('../../dist/datatypes/service-context');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('elasticache deployers common module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('getClusterName', function () {
        it('should return the shortened cluster name from the ServiceContext', function () {
            let serviceContext = new ServiceContext("MyFakeAppWithALongNameWithManyCharacters", "MyLongEnvName", "MyLongishServiceName", "redis", {});
            let clusterName = elasticacheDeployersCommon.getClusterName(serviceContext);
            expect(clusterName).to.equal("MyFakeApp-MyL-MyLong");
        });
    });
});