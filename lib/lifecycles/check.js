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
const util = require('../common/util');
const checkPhase = require('../phases/check');

exports.check = function (handelFile, handelFileParser, serviceDeployers) {
    let errors = {};
    for (let environmentToCheck in handelFile.environments) {
        let environmentContext = util.createEnvironmentContext(handelFile, handelFileParser, environmentToCheck, "1", null); //Use fake version of deploy_version and no account config
        errors[environmentToCheck] = checkPhase.checkServices(serviceDeployers, environmentContext);
    }
    return errors;
}