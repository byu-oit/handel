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
const accountConfig = require('../../../lib/common/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const deployableArtifact = require('../../../lib/services/beanstalk/deployable-artifact');
const deployersCommon = require('../../../lib/common/deployers-common');
const ebextensions = require('../../../lib/services/beanstalk/ebextensions');
const ServiceContext = require('../../../lib/datatypes/service-context');
const util = require('../../../lib/common/util');
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('deployable artifact module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('prepareAndUploadDeployableArtifact', function () {
        let bucket = "FakeBucket";
        let key = "FakeKey";

        it("should prepare and upload a directory", function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "beanstalk", "1", {
                path_to_code: "."
            });

            let lstatStub = sandbox.stub(fs, 'lstatSync').returns({ isDirectory: function () { return true; } })
            let addEbextensionsStub = sandbox.stub(ebextensions, 'addEbextensionsToDir').returns(true);
            let zipDirStub = sandbox.stub(util, 'zipDirectoryToFile').returns(Promise.resolve(true));
            let uploadFileStub = sandbox.stub(deployersCommon, 'uploadFileToHandelBucket').returns(Promise.resolve({
                Bucket: bucket,
                Key: key
            }));
            let unlinkStub = sandbox.stub(fs, 'unlinkSync').returns(true);
            let deleteEbextensionsStub = sandbox.stub(ebextensions, 'deleteAddedEbExtensionsFromDirectory').returns(true);
            let copyDirectoryStub = sandbox.stub(util, 'copyDirectory').returns(Promise.resolve(true));

            return deployableArtifact.prepareAndUploadDeployableArtifact(serviceContext, [])
                .then(s3ArtifactInfo => {
                    expect(s3ArtifactInfo.Bucket).to.equal(bucket);
                    expect(s3ArtifactInfo.Key).to.equal(key);
                    expect(lstatStub.callCount).to.equal(1);
                    expect(addEbextensionsStub.callCount).to.equal(1);
                    expect(zipDirStub.callCount).to.equal(1);
                    expect(uploadFileStub.callCount).to.equal(1);
                    expect(unlinkStub.callCount).to.equal(1);
                    expect(copyDirectoryStub.callCount).to.equal(1);
                });
        });

        it("should return a not implemented error for a WAR", function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "beanstalk", "1", {
                path_to_code: "./mysubdir/test.war"
            });

            let lstatStub = sandbox.stub(fs, 'lstatSync').returns({ isDirectory: function () { return false; } });

            return deployableArtifact.prepareAndUploadDeployableArtifact(serviceContext, [])
                .then(s3ArtifactInfo => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(lstatStub.callCount).to.equal(1);
                    expect(err.message).to.equal("Not Implemented");
                });
        });

        it("should prepare and upload a JAR", function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "beanstalk", "1", {
                path_to_code: "./mysubdir/test.jar"
            });

            let lstatStub = sandbox.stub(fs, 'lstatSync').returns({ isDirectory: function () { return false; } });
            let resolveStub = sandbox.stub(path, 'resolve').returns('/fake/path/to/test.jar');
            let basenameStub = sandbox.stub(path, 'basename').returns('test.jar');
            let dirnameStub = sandbox.stub(path, 'dirname').returns('/fake/path/to');
            let copyFileStub = sandbox.stub(util, 'copyFile').returns(Promise.resolve(true));
            let existsStub = sandbox.stub(fs, 'existsSync').returns(true);
            let copyDirectoryStub = sandbox.stub(util, 'copyDirectory').returns(Promise.resolve(true));
            let addEbextensionsStub = sandbox.stub(ebextensions, 'addEbextensionsToDir').returns(true);
            let zipDirStub = sandbox.stub(util, 'zipDirectoryToFile').returns(Promise.resolve(true));
            let uploadFileStub = sandbox.stub(deployersCommon, 'uploadFileToHandelBucket').returns(Promise.resolve({
                Bucket: bucket,
                Key: key
            }));
            let unlinkStub = sandbox.stub(fs, 'unlinkSync').returns(true);

            return deployableArtifact.prepareAndUploadDeployableArtifact(serviceContext, [])
                .then(s3ArtifactInfo => {
                    expect(s3ArtifactInfo.Bucket).to.equal(bucket);
                    expect(s3ArtifactInfo.Key).to.equal(key);
                    expect(lstatStub.callCount).to.equal(1);
                    expect(resolveStub.callCount).to.equal(2);
                    expect(basenameStub.callCount).to.equal(1);
                    expect(dirnameStub.callCount).to.equal(1);
                    expect(copyFileStub.callCount).to.equal(1);
                    expect(existsStub.callCount).to.equal(2);
                    expect(copyDirectoryStub.callCount).to.equal(1);
                    expect(addEbextensionsStub.callCount).to.equal(1);
                    expect(zipDirStub.callCount).to.equal(1);
                    expect(uploadFileStub.callCount).to.equal(1);
                    expect(unlinkStub.callCount).to.equal(1);
                });
        });

        it("should return a not implemented error with a ZIP", function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "beanstalk", "1", {
                path_to_code: "./mysubdir/test.zip"
            });

            let lstatStub = sandbox.stub(fs, 'lstatSync').returns({ isDirectory: function () { return false; } });

            return deployableArtifact.prepareAndUploadDeployableArtifact(serviceContext, [])
                .then(s3ArtifactInfo => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(lstatStub.callCount).to.equal(1);
                    expect(err.message).to.equal("Not Implemented");
                });
        });

        it("should prepare and upload a Dockerrun.aws.json file", function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "beanstalk", "1", {
                path_to_code: "./mysubdir/Dockerrun.aws.json"
            });

            let lstatStub = sandbox.stub(fs, 'lstatSync').returns({ isDirectory: function () { return false; } });
            let resolveStub = sandbox.stub(path, 'resolve').returns('/fake/path/to/test.jar');
            let dirnameStub = sandbox.stub(path, 'dirname').returns('/fake/path/to');
            let copyFileStub = sandbox.stub(util, 'copyFile').returns(Promise.resolve(true));
            let existsStub = sandbox.stub(fs, 'existsSync').returns(true);
            let copyDirectoryStub = sandbox.stub(util, 'copyDirectory').returns(Promise.resolve(true));
            let addEbextensionsStub = sandbox.stub(ebextensions, 'addEbextensionsToDir').returns(true);
            let zipDirStub = sandbox.stub(util, 'zipDirectoryToFile').returns(Promise.resolve(true));
            let uploadFileStub = sandbox.stub(deployersCommon, 'uploadFileToHandelBucket').returns(Promise.resolve({
                Bucket: bucket,
                Key: key
            }));
            let unlinkStub = sandbox.stub(fs, 'unlinkSync').returns(true);

            return deployableArtifact.prepareAndUploadDeployableArtifact(serviceContext, [])
                .then(s3ArtifactInfo => {
                    expect(s3ArtifactInfo.Bucket).to.equal(bucket);
                    expect(s3ArtifactInfo.Key).to.equal(key);
                    expect(lstatStub.callCount).to.equal(1);
                    expect(resolveStub.callCount).to.equal(1);
                    expect(dirnameStub.callCount).to.equal(1);
                    expect(copyFileStub.callCount).to.equal(1);
                    expect(existsStub.callCount).to.equal(2);
                    expect(copyDirectoryStub.callCount).to.equal(1);
                    expect(addEbextensionsStub.callCount).to.equal(1);
                    expect(zipDirStub.callCount).to.equal(1);
                    expect(uploadFileStub.callCount).to.equal(1);
                    expect(unlinkStub.callCount).to.equal(1);
                });
        });

        it("should prepare and upload any other type of file", function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "beanstalk", "1", {
                path_to_code: "./mysubdir/mybinary"
            });

            let lstatStub = sandbox.stub(fs, 'lstatSync').returns({ isDirectory: function () { return false; } });
            let resolveStub = sandbox.stub(path, 'resolve').returns('/fake/path/to/test.jar');
            let basenameStub = sandbox.stub(path, 'basename').returns('test.jar');
            let dirnameStub = sandbox.stub(path, 'dirname').returns('/fake/path/to');
            let copyFileStub = sandbox.stub(util, 'copyFile').returns(Promise.resolve(true));
            let existsStub = sandbox.stub(fs, 'existsSync').returns(true);
            let copyDirectoryStub = sandbox.stub(util, 'copyDirectory').returns(Promise.resolve(true));
            let addEbextensionsStub = sandbox.stub(ebextensions, 'addEbextensionsToDir').returns(true);
            let zipDirStub = sandbox.stub(util, 'zipDirectoryToFile').returns(Promise.resolve(true));
            let uploadFileStub = sandbox.stub(deployersCommon, 'uploadFileToHandelBucket').returns(Promise.resolve({
                Bucket: bucket,
                Key: key
            }));
            let unlinkStub = sandbox.stub(fs, 'unlinkSync').returns(true);

            return deployableArtifact.prepareAndUploadDeployableArtifact(serviceContext, [])
                .then(s3ArtifactInfo => {
                    expect(s3ArtifactInfo.Bucket).to.equal(bucket);
                    expect(s3ArtifactInfo.Key).to.equal(key);
                    expect(lstatStub.callCount).to.equal(1);
                    expect(resolveStub.callCount).to.equal(2);
                    expect(basenameStub.callCount).to.equal(1);
                    expect(dirnameStub.callCount).to.equal(1);
                    expect(copyFileStub.callCount).to.equal(1);
                    expect(existsStub.callCount).to.equal(2);
                    expect(copyDirectoryStub.callCount).to.equal(1);
                    expect(addEbextensionsStub.callCount).to.equal(1);
                    expect(zipDirStub.callCount).to.equal(1);
                    expect(uploadFileStub.callCount).to.equal(1);
                    expect(unlinkStub.callCount).to.equal(1);
                });
        });
    });
});