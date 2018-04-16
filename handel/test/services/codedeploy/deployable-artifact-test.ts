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
import config from '../../../src/account-config/account-config';
import * as deployPhaseCommon from '../../../src/common/deploy-phase-common';
import * as handlebarsUtils from '../../../src/common/handlebars-utils';
import * as util from '../../../src/common/util';
import { CodeDeployServiceConfig } from '../../../src/services/codedeploy/config-types';
import * as deployableArtifact from '../../../src/services/codedeploy/deployable-artifact';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('codedeploy asg-launchconfig config module', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<CodeDeployServiceConfig>;
    let serviceParams: CodeDeployServiceConfig;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        serviceParams = {
            type: 'codedeploy',
            path_to_code: '.',
            os: 'linux'
        };
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 'codedeploy'), serviceParams, accountConfig);
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('prepareAndUploadDeployableArtifactToS3', () => {
        it('should enrich the appspec file and upload the bundle to S3', async () => {
            const makeTmpDirStub = sandbox.stub(util, 'makeTmpDir').resolves('/Fake/Tmp/Dir/Path');
            const copyDirStub = sandbox.stub(util, 'copyDirectory').resolves();
            const readYamlFileStub = sandbox.stub(util, 'readYamlFileSync').returns({
                hooks: {
                    BeforeInstall: [{
                        location: 'FakeLocation'
                    }],
                    AfterInstall: [{
                        location: 'FakeLocation2'
                    }]
                }
            });
            const compileTemplateStub = sandbox.stub(handlebarsUtils, 'compileTemplate').resolves('Fake Compiled Template');
            const writeFileStub = sandbox.stub(util, 'writeFileSync').returns('');
            const uploadArtifactStub = sandbox.stub(deployPhaseCommon, 'uploadDeployableArtifactToHandelBucket').resolves({
                Bucket: 'FakeBucket',
                Key: 'FakeKey'
            });
            const deleteDirStub = sandbox.stub(util, 'deleteFolderRecursive').resolves();

            const s3ObjectInfo = await deployableArtifact.prepareAndUploadDeployableArtifactToS3(serviceContext, [], 'CodeDeploy');
            expect(s3ObjectInfo).to.deep.equal({
                Bucket: 'FakeBucket',
                Key: 'FakeKey'
            });
            expect(makeTmpDirStub.callCount).to.equal(1);
            expect(copyDirStub.callCount).to.equal(1);
            expect(readYamlFileStub.callCount).to.equal(1);
            expect(compileTemplateStub.callCount).to.equal(2); // Called once for each enriched hook script
            expect(writeFileStub.callCount).to.equal(3); // Called once for each enriched hook script, and last time to write enriched appspec file
            expect(uploadArtifactStub.callCount).to.equal(1);
            expect(deleteDirStub.callCount).to.equal(1);
        });
    });
});
