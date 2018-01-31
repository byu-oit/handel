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
import 'mocha';
import * as sinon from 'sinon';
import * as ebextensions from '../../../src/services/beanstalk/ebextensions';

describe('ebextensions module', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('addEbextensionToSourceFile', () => {
        it('should add the injected ebextensions to the directory when un unzipped dir is given', () => {
            const ebextensionsFiles = {
                'myinjected.config': 'SomeEbextensionFileContent',
                'myotherinjected.config': 'SomeOtherContent'
            };
            const pathToArtifact = './fake/path/on/system';

            const existsStub = sandbox.stub(fs, 'existsSync').returns(false);
            const mkdirStub = sandbox.stub(fs, 'mkdirSync').returns(true);
            const writeFileStub = sandbox.stub(fs, 'writeFileSync').returns(true);

            const success = ebextensions.addEbextensionsToDir(ebextensionsFiles, pathToArtifact);
            expect(success).to.equal(true);
            expect(existsStub.callCount).to.equal(1);
            expect(mkdirStub.callCount).to.equal(1);
            expect(writeFileStub.callCount).to.equal(2);
        });
    });

    describe('deleteAddedEbExtensionsFromDirectory', () => {
        it('should delete the injected ebextensions from the directory when an unzipped dir is given', () => {
            const ebextensionsFiles = {
                'myinjected.config': 'SomeEbextensionFileContent',
                'myotherinjected.config': 'SomeOtherContent'
            };
            const pathToArtifact = './fake/path/on/system';

            const unlinkStub = sandbox.stub(fs, 'unlinkSync').returns(true);
            const readdirStub = sandbox.stub(fs, 'readdirSync').returns([]);
            const rmdirStub = sandbox.stub(fs, 'rmdirSync').returns(true);

            const success = ebextensions.deleteAddedEbExtensionsFromDirectory(ebextensionsFiles, pathToArtifact);
            expect(success).to.equal(true);
            expect(unlinkStub.callCount).to.equal(2);
            expect(readdirStub.callCount).to.equal(1);
            expect(rmdirStub.callCount).to.equal(1);
        });
    });
});
