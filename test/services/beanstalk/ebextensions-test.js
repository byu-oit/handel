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
const ebextensions = require('../../../lib/services/beanstalk/ebextensions');
const fs = require('fs');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('ebextensions module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('addEbextensionToSourceFile', function () {
        it('should add the injected ebextensions to the directory when un unzipped dir is given', function () {
            let ebextensionsFiles = {
                'myinjected.config': 'SomeEbextensionFileContent',
                'myotherinjected.config': 'SomeOtherContent'
            }
            let pathToArtifact = './fake/path/on/system';


            let existsStub = sandbox.stub(fs, 'existsSync').returns(false);
            let mkdirStub = sandbox.stub(fs, 'mkdirSync').returns(true);
            let writeFileStub = sandbox.stub(fs, 'writeFileSync').returns(true);

            let success = ebextensions.addEbextensionsToDir(ebextensionsFiles, pathToArtifact)
            expect(success).to.be.true;
            expect(existsStub.calledOnce).to.be.true;
            expect(mkdirStub.calledOnce).to.be.true;
            expect(writeFileStub.calledTwice).to.be.true;
        });
    });

    describe('deleteAddedEbExtensionsFromDirectory', function () {
        it('should delete the injected ebextensions from the directory when an unzipped dir is given', function () {
            let ebextensionsFiles = {
                'myinjected.config': 'SomeEbextensionFileContent',
                'myotherinjected.config': 'SomeOtherContent'
            }
            let pathToArtifact = './fake/path/on/system';

            let unlinkStub = sandbox.stub(fs, 'unlinkSync').returns(true);
            let readdirStub = sandbox.stub(fs, 'readdirSync').returns([]);
            let rmdirStub = sandbox.stub(fs, 'rmdirSync').returns(true);

            let success = ebextensions.deleteAddedEbExtensionsFromDirectory(ebextensionsFiles, pathToArtifact)
            expect(success).to.be.true;
            expect(unlinkStub.calledTwice).to.be.true;
            expect(readdirStub.calledOnce).to.be.true;
            expect(rmdirStub.calledOnce).to.be.true;
        });
    });
});