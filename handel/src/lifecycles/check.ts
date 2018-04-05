/*
 * Copyright 2018 Brigham Young University
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
import {ServiceRegistry} from 'handel-extension-api';
import * as util from '../common/util';
import { AccountConfig, CheckOptions, EnvironmentsCheckResults, HandelFile, HandelFileParser } from '../datatypes';
import * as checkPhase from '../phases/check';

// TODO - This is ugly having to inject a fake account config just to run a check. We should refactor not to have to do this.
const fakeAccountConfig: AccountConfig = {
    account_id: '111111111111',
    region: 'us-west-2',
    vpc: 'vpc-2222222',
    public_subnets: [
        'subnet-333333333'
    ],
    private_subnets: [
        'subnet-444444444',
    ],
    data_subnets: [
        'subnet-555555555'
    ],
    elasticache_subnet_group: 'fake-subnet-group',
    rds_subnet_group: 'fake-subnet-group',
    redshift_subnet_group: 'fake-subnet-group'
};

export function check(handelFile: HandelFile, handelFileParser: HandelFileParser, serviceRegistry: ServiceRegistry, options: CheckOptions): EnvironmentsCheckResults {
    const errors: EnvironmentsCheckResults = {};
    for (const environmentToCheck in handelFile.environments) {
        if (handelFile.environments.hasOwnProperty(environmentToCheck)) {
            const environmentContext = util.createEnvironmentContext(handelFile, handelFileParser, environmentToCheck, fakeAccountConfig, serviceRegistry, options); // Use fake account config for now during check
            errors[environmentToCheck] = checkPhase.checkServices(serviceRegistry, environmentContext);
        }
    }
    return errors;
}
