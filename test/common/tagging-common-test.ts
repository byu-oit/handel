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
import {expect} from 'chai';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import {getTags} from '../../src/common/tagging-common';
import {AccountConfig, ServiceConfig, ServiceContext} from '../../src/datatypes';

describe('Tagging common module', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<ServiceConfig>;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    const serviceName = 'FakeService';

    beforeEach(async () => {
        const retAccountConfig = await config(`${__dirname}/../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        accountConfig = retAccountConfig;
        serviceContext = new ServiceContext(appName, envName, serviceName, 'FakeType', {type: 'FakeType'}, retAccountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getTags', () => {
        it('should return the Handel-injected tags, plus any user-defined tags', () => {
            serviceContext.params = {
                type: 'faketype',
                tags: {
                    mytag: 'myvalue'
                }
            };

            const returnTags = getTags(serviceContext);
            expect(returnTags.app).to.equal('FakeApp');
            expect(returnTags.env).to.equal('FakeEnv');
            expect(returnTags.mytag).to.equal('myvalue');
        });

        it('should include any application-level tags', () => {
            serviceContext.tags = {
                aTag: 'a value'
            };
            serviceContext.params = {
                type: 'faketype',
                tags: {
                    mytag: 'myvalue'
                }
            };

            const returnTags = getTags(serviceContext);
            expect(returnTags.mytag).to.equal('myvalue');
            expect(returnTags.aTag).to.equal('a value');
        });

        it('should prefer service tags to application tags', () => {
            serviceContext.tags = {
                mytag: 'application'
            };
            serviceContext.params = {
                type: 'faketype',
                tags: {
                    mytag: 'service'
                }
            };

            const returnTags = getTags(serviceContext);
            expect(returnTags.mytag).to.equal('service');
        });

        it('should prefer Handel tags to service or application tags', () => {
             serviceContext.tags = {
                env: 'application'
            };
            serviceContext.params = {
                type: 'faketype',
                tags: {
                    env: 'service'
                }
            };

            const returnTags = getTags(serviceContext);
            expect(returnTags.env).to.equal('service');
        });
    });
});
