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
import { expect } from 'chai';
import { AccountConfig, ServiceContext, ServiceType } from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import * as elasticacheDeployersCommon from '../../src/common/elasticache-deployers-common';
import { STDLIB_PREFIX } from '../../src/services/stdlib';

describe('elasticache deployers common module', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        sandbox = sinon.createSandbox();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getClusterName', () => {
        it('should return the shortened cluster name from the ServiceContext, removing hyphens in the segments', () => {
            const serviceContext = new ServiceContext('My-FakeAppWithALongNameWithManyCharacters', 'MyLongEnvName', 'MyLongishServiceName', new ServiceType(STDLIB_PREFIX, 'redis'), {type: 'redis'}, accountConfig);
            const clusterName = elasticacheDeployersCommon.getClusterName(serviceContext);
            expect(clusterName).to.equal('MyFakeAp-MyL-MyLong');
        });
    });
});
