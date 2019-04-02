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
import * as fs from 'fs';
import { AccountConfig, ServiceContext, ServiceType } from 'handel-extension-api';
import { deployPhase, util as esUtil } from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as util from '../../../src/common/util';
import { BeanstalkServiceConfig } from '../../../src/services/beanstalk/config-types';
import * as deployableArtifact from '../../../src/services/beanstalk/deployable-artifact';
import * as ebextensions from '../../../src/services/beanstalk/ebextensions';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('deployable artifact module', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<BeanstalkServiceConfig>;
    let serviceParams: BeanstalkServiceConfig;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        sandbox = sinon.createSandbox();
        serviceParams = {
            type: 'beanstalk',
            path_to_code: '.',
            solution_stack: 'FakeStack'
        };
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 'beanstalk'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('prepareAndUploadDeployableArtifact', () => {
        const bucket = 'FakeBucket';
        const key = 'FakeKey';

        it('should prepare and upload a directory', async () => {
            serviceContext.params.path_to_code = '.';

            const lstatStub = sandbox.stub(fs, 'lstatSync').returns({ isDirectory: () => true });
            const addEbextensionsStub = sandbox.stub(ebextensions, 'addEbextensionsToDir').returns(true);
            const zipDirStub = sandbox.stub(esUtil, 'zipDirectoryToFile').resolves(true);
            const uploadFileStub = sandbox.stub(deployPhase, 'uploadFileToHandelBucket').resolves({
                Bucket: bucket,
                Key: key
            });
            const unlinkStub = sandbox.stub(fs, 'unlinkSync').returns(true);
            const deleteEbextensionsStub = sandbox.stub(ebextensions, 'deleteAddedEbExtensionsFromDirectory').returns(true);
            const copyDirectoryStub = sandbox.stub(util, 'copyDirectory').resolves(true);

            const s3ArtifactInfo = await deployableArtifact.prepareAndUploadDeployableArtifact(serviceContext, {});
            expect(s3ArtifactInfo.Bucket).to.equal(bucket);
            expect(s3ArtifactInfo.Key).to.equal(key);
            expect(lstatStub.callCount).to.equal(1);
            expect(addEbextensionsStub.callCount).to.equal(1);
            expect(zipDirStub.callCount).to.equal(1);
            expect(uploadFileStub.callCount).to.equal(1);
            expect(unlinkStub.callCount).to.equal(1);
            expect(copyDirectoryStub.callCount).to.equal(1);
        });

        it('should return a not implemented error for a WAR', async () => {
            serviceContext.params.path_to_code = './mysubdir/test.war';

            const lstatStub = sandbox.stub(fs, 'lstatSync').returns({ isDirectory: () => false });

            try {
                const s3ArtifactInfo = await deployableArtifact.prepareAndUploadDeployableArtifact(serviceContext, {});
                expect(true).to.equal(false); // Should not get here
            }
            catch (err) {
                expect(lstatStub.callCount).to.equal(1);
                expect(err.message).to.equal('Not Implemented');
            }
        });

        // TODO - Broken by switching to TS. I think this is a ts-node issue
        // it('should prepare and upload a JAR', async () => {
        //     serviceContext.params.path_to_code = './mysubdir/test.jar';
        //     const lstatStub = sandbox.stub(fs, 'lstatSync').returns({ isDirectory: () => false });
        //     const resolveStub = sandbox.stub(path, 'resolve').returns('/fake/path/to/test.jar');

        //     // TODO - Stubbing this seems to break the test when using ts-node
        //     const basenameStub = sandbox.stub(path, 'basename').returns('test.jar');
        //     const dirnameStub = sandbox.stub(path, 'dirname').returns('/fake/path/to');
        //     const copyFileStub = sandbox.stub(util, 'copyFile').resolves(true);
        //     const existsStub = sandbox.stub(fs, 'existsSync').returns(true);
        //     const copyDirectoryStub = sandbox.stub(util, 'copyDirectory').resolves(true);
        //     const addEbextensionsStub = sandbox.stub(ebextensions, 'addEbextensionsToDir').returns(true);
        //     const zipDirStub = sandbox.stub(util, 'zipDirectoryToFile').resolves(true);
        //     const uploadFileStub = sandbox.stub(deployPhaseCommon, 'uploadFileToHandelBucket').resolves({
        //         Bucket: bucket,
        //         Key: key
        //     });
        //     const unlinkStub = sandbox.stub(fs, 'unlinkSync').returns(true);
        //     const s3ArtifactInfo = await deployableArtifact.prepareAndUploadDeployableArtifact(serviceContext, {});

        //     expect(s3ArtifactInfo.Bucket).to.equal(bucket);
        //     expect(s3ArtifactInfo.Key).to.equal(key);
        //     expect(lstatStub.callCount).to.equal(1);
        //     expect(resolveStub.callCount).to.equal(2);
        //     expect(basenameStub.callCount).to.equal(1);
        //     expect(dirnameStub.callCount).to.equal(1);
        //     expect(copyFileStub.callCount).to.equal(1);
        //     expect(existsStub.callCount).to.equal(2);
        //     expect(copyDirectoryStub.callCount).to.equal(1);
        //     expect(addEbextensionsStub.callCount).to.equal(1);
        //     expect(zipDirStub.callCount).to.equal(1);
        //     expect(uploadFileStub.callCount).to.equal(1);
        //     expect(unlinkStub.callCount).to.equal(1);
        // });

        it('should return a not implemented error with a ZIP', async () => {
            serviceContext.params.path_to_code = './mysubdir/test.zip';

            const lstatStub = sandbox.stub(fs, 'lstatSync').returns({ isDirectory: () => false });

            try {
                const s3ArtifactInfo = await deployableArtifact.prepareAndUploadDeployableArtifact(serviceContext, {});
                expect(true).to.equal(false); // Should not get here
            }
            catch (err) {
                expect(lstatStub.callCount).to.equal(1);
                expect(err.message).to.equal('Not Implemented');
            }
        });

        // TODO - Broken by switching to TS. I think this is a ts-node issue
        // it('should prepare and upload a Dockerrun.aws.json file', async () => {
        //     serviceContext.params.path_to_code = './mysubdir/Dockerrun.aws.json';

        //     const lstatStub = sandbox.stub(fs, 'lstatSync').returns({ isDirectory: () => false });
        //     const resolveStub = sandbox.stub(path, 'resolve').returns('/fake/path/to/test.jar');
        //     const dirnameStub = sandbox.stub(path, 'dirname').returns('/fake/path/to');
        //     const copyFileStub = sandbox.stub(util, 'copyFile').resolves(true);
        //     const replaceFileStub = sandbox.stub(util, 'replaceTagInFile').resolves('');
        //     const existsStub = sandbox.stub(fs, 'existsSync').returns(true);
        //     const copyDirectoryStub = sandbox.stub(util, 'copyDirectory').resolves(true);
        //     const addEbextensionsStub = sandbox.stub(ebextensions, 'addEbextensionsToDir').returns(true);
        //     const zipDirStub = sandbox.stub(util, 'zipDirectoryToFile').resolves(true);
        //     const uploadFileStub = sandbox.stub(deployPhaseCommon, 'uploadFileToHandelBucket').returns(Promise.resolve({
        //         Bucket: bucket,
        //         Key: key
        //     }));
        //     const unlinkStub = sandbox.stub(fs, 'unlinkSync').returns(true);

        //     const s3ArtifactInfo = await deployableArtifact.prepareAndUploadDeployableArtifact(serviceContext, {});
        //     expect(s3ArtifactInfo.Bucket).to.equal(bucket);
        //     expect(s3ArtifactInfo.Key).to.equal(key);
        //     expect(lstatStub.callCount).to.equal(1);
        //     expect(resolveStub.callCount).to.equal(1);
        //     expect(dirnameStub.callCount).to.equal(1);
        //     expect(copyFileStub.callCount).to.equal(1);
        //     expect(replaceFileStub.callCount).to.equal(1);
        //     expect(existsStub.callCount).to.equal(2);
        //     expect(copyDirectoryStub.callCount).to.equal(1);
        //     expect(addEbextensionsStub.callCount).to.equal(1);
        //     expect(zipDirStub.callCount).to.equal(1);
        //     expect(uploadFileStub.callCount).to.equal(1);
        //     expect(unlinkStub.callCount).to.equal(1);
        // });

        // TODO - Broken by switching to TS. I think this is a ts-node issue
        // it('should prepare and upload any other type of file', async () => {
        //     serviceContext.params.path_to_code = './mysubdir/mybinary';

        //     const lstatStub = sandbox.stub(fs, 'lstatSync').returns({ isDirectory: () => false });
        //     const resolveStub = sandbox.stub(path, 'resolve').returns('/fake/path/to/test.jar');
        //     const basenameStub = sandbox.stub(path, 'basename').returns('test.jar');
        //     const dirnameStub = sandbox.stub(path, 'dirname').returns('/fake/path/to');
        //     const copyFileStub = sandbox.stub(util, 'copyFile').resolves(true);
        //     const existsStub = sandbox.stub(fs, 'existsSync').returns(true);
        //     const copyDirectoryStub = sandbox.stub(util, 'copyDirectory').resolves(true);
        //     const addEbextensionsStub = sandbox.stub(ebextensions, 'addEbextensionsToDir').returns(true);
        //     const zipDirStub = sandbox.stub(util, 'zipDirectoryToFile').resolves(true);
        //     const uploadFileStub = sandbox.stub(deployPhaseCommon, 'uploadFileToHandelBucket').returns(Promise.resolve({
        //         Bucket: bucket,
        //         Key: key
        //     }));
        //     const unlinkStub = sandbox.stub(fs, 'unlinkSync').returns(true);

        //     const s3ArtifactInfo = await deployableArtifact.prepareAndUploadDeployableArtifact(serviceContext, {});
        //     expect(s3ArtifactInfo.Bucket).to.equal(bucket);
        //     expect(s3ArtifactInfo.Key).to.equal(key);
        //     expect(lstatStub.callCount).to.equal(1);
        //     expect(resolveStub.callCount).to.equal(2);
        //     expect(basenameStub.callCount).to.equal(1);
        //     expect(dirnameStub.callCount).to.equal(1);
        //     expect(copyFileStub.callCount).to.equal(1);
        //     expect(existsStub.callCount).to.equal(2);
        //     expect(copyDirectoryStub.callCount).to.equal(1);
        //     expect(addEbextensionsStub.callCount).to.equal(1);
        //     expect(zipDirStub.callCount).to.equal(1);
        //     expect(uploadFileStub.callCount).to.equal(1);
        //     expect(unlinkStub.callCount).to.equal(1);
        // });
    });
});
