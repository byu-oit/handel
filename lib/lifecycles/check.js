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
const config = require('../common/account-config');
const util = require('../common/util');
const winston = require('winston');
const checkPhase = require('../phases/check');

exports.check = function (handelFile) {
    //TODO - This using a fake account config is pretty ugly. It'd be nice not to have to use it if possible
    //Use fake account config
    config({
        account_id: 111111111111,
        region: 'us-west-2',
        vpc: 'vpc-aaaaaaaa',
        public_subnets: [
            'subnet-ffffffff',
            'subnet-44444444'
        ],
        private_subnets: [
            'subnet-00000000',
            'subnet-77777777'
        ],
        data_subnets: [
            'subnet-eeeeeeee',
            'subnet-99999999'
        ],
        ssh_bastion_sg: 'sg-44444444'
    }).getAccountConfig();

    //Load all the currently implemented service deployers from the 'services' directory
    let serviceDeployers = util.getServiceDeployers();

    //Load Handel file from path and validate it
    winston.info("Validating and parsing Handel file");
    let handelFileParser = util.getHandelFileParser(handelFile);
    handelFileParser.validateHandelFile(handelFile, serviceDeployers);

    let errors = {};
    for (let environmentToCheck in handelFile.environments) {
        let environmentContext = util.createEnvironmentContext(handelFile, handelFileParser, environmentToCheck, "1"); //Use fake version of deploy_version
        errors[environmentToCheck] = checkPhase.checkServices(serviceDeployers, environmentContext);
    }
    return errors;
}