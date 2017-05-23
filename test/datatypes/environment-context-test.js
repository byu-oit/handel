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
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const expect = require('chai').expect;

describe('EnvironmentContext', function() {
    it('should be able to be constructed with required parameters', function() {
        let appName = "FakeApp";
        let deployVersion = 1;
        let environmentName = "FakeEnvironment";
        let environmentContext = new EnvironmentContext(appName, deployVersion, environmentName);
        expect(environmentContext.appName).to.equal(appName);
        expect(environmentContext.deployVersion).to.equal(deployVersion);
        expect(environmentContext.environmentName).to.equal(environmentName);
        expect(environmentContext.serviceContexts).to.deep.equal({});
    });
});