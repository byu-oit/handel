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
import { ServiceConfig, ServiceContext, ServiceType } from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import * as checkPhase from '../../src/common/check-phase';
import accountConfig from '../fake-account-config';

describe('Delete phases common module', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<ServiceConfig>;

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService',
            new ServiceType('someExtension', 'fakeservice'), {type: 'fakeservice'}, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('checkJsonSchema', () => {
        it('should return an empty list when validating a correct set of params', () => {
            const response = checkPhase.checkJsonSchema(`${__dirname}/test-json-schema.json`, serviceContext);
            expect(response).to.deep.equal([]);
        });

        it('should return errors when any of the params fail schema validation', () => {
            serviceContext.params.tags = {
                'fake': 'tag'
            };
            const response = checkPhase.checkJsonSchema(`${__dirname}/test-json-schema.json`, serviceContext);
            expect(response).to.deep.equal([`Invalid/unknown property specified in 'fakeservice' service type`]);
        });

        it('should return an error when the schema fails to load', () => {
            const response = checkPhase.checkJsonSchema(`${__dirname}/nonexistent-json-schema.json`, serviceContext);
            expect(response).to.deep.equal([`Couldn't read schema file to check the service schema`]);
        });
    });
});
