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
import * as sinon from 'sinon';
import * as util from '../../src/common/util';
import { EnvironmentContext } from '../../src/datatypes';

describe('util module', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('readDirSync', () => {
        it('should return null on an error', () => {
            sandbox.stub(fs, 'readdirSync').throws(new Error('someMessage'));
            const result = util.readDirSync('somePath');
            expect(result).to.equal(null);
        });

        it('should return an array of names on success', () => {
            sandbox.stub(fs, 'readdirSync').returns([]);
            const result = util.readDirSync('somePath');
            expect(result).to.be.an('array');
        });
    });

    describe('readFileSync', () => {
        it('should return null on an error', () => {
            sandbox.stub(fs, 'readFileSync').throws(new Error('someMessage'));
            const result = util.readFileSync('somePath');
            expect(result).to.equal(null);
        });

        it('should return the file contents on success', () => {
            sandbox.stub(fs, 'readFileSync').returns('');
            const result = util.readFileSync('somePath');
            expect(result).to.equal('');
        });
    });

    describe('writeFileSync', () => {
        it('should return null on an error', () => {
            sandbox.stub(fs, 'writeFileSync').throws(new Error('someMessage'));
            const result = util.writeFileSync('somePath', '');
            expect(result).to.equal(null);
        });

        it('should return undefined on success', () => {
            sandbox.stub(fs, 'writeFileSync');
            const result = util.writeFileSync('somePath', '');
            expect(result).to.equal('');
        });
    });

    describe('readJsonFileSync', () => {
        it('should return null on an error', () => {
            sandbox.stub(fs, 'readFileSync').throws(new Error('someMessage'));
            const result = util.readJsonFileSync('somePath');
            expect(result).to.equal(null);
        });

        it('should return the yaml object on success', () => {
            sandbox.stub(fs, 'readFileSync').returns(`{"key": "value"}`);
            const result = util.readJsonFileSync('somePath');
            expect(result.key).to.equal('value');
        });
    });

    describe('readYamlFileSync', () => {
        it('should return null on an error', () => {
            sandbox.stub(fs, 'readFileSync').throws(new Error('someMessage'));
            const result = util.readYamlFileSync('somePath');
            expect(result).to.equal(null);
        });

        it('should return the yaml object on success', () => {
            sandbox.stub(fs, 'readFileSync').returns('key: value');
            const result = util.readYamlFileSync('somePath');
            expect(result.key).to.equal('value');
        });
    });

    describe('readYamlFileAsync', () => {
        it('should return the yaml object on success', async () => {
            sandbox.stub(fs, 'readFile').callsArgWith(2, null, 'key: value');
            const result = await util.readYamlFileAsync('somePath');
            expect(result.key).to.equal('value');
        });

        it('should return a rejected promise on error', async () => {
            sandbox.stub(fs, 'readFile').callsArgWith(2, new Error('error'), null);
            try {
                const result = await util.readYamlFileAsync('somePath');
                expect(true).to.equal(false); // Should not get here
            }
            catch (err) {
                expect(err.message).to.equal('error');
            }
        });
    });

    describe('replaceTagInFile', () => {
        it('should replace regex strings in a file on success', () => {
            sandbox.stub(util, 'readFileSync').returns('This is a string with a <sub_var> replacement tag.');
            const stubWrite = sandbox.stub(util, 'writeFileSync').returns(undefined);
            const lstTag = [
                { regex: / a \<sub_var\>/g, value: 'out a' },
                { regex: / replacement/g, value: '' }
            ];
            const result = util.replaceTagInFile(lstTag, 'somePath', 'someFile');
            // TODO - Need to figure this out with Typescript an sinon-chai
            // expect(stubWrite).to.have.been.calledWith(sinon.match.string, 'This is a string without a tag.');
        });

        it('should return null on error', () => {
            sandbox.stub(util, 'readFileSync').returns(null);
            const result = util.replaceTagInFile(null, 'somePath', 'someFile');
            expect(result).to.equal(null);
        });
    });

    describe('zipDirectoryToFile', () => {
        const zippedPath = `${__dirname}/zipped-test-file.zip`;

        afterEach(() => {
            if (fs.existsSync(zippedPath)) {
                fs.unlinkSync(zippedPath); // Ensure created ZIP archive gets deleted
            }
        });

        it('should zip the given directory if it exists', () => {
            return util.zipDirectoryToFile(__dirname, zippedPath)
                .then(() => {
                    expect(fs.existsSync(zippedPath)).to.equal(true);
                });
        });

        it('should throw an error if the given directory doesnt exist', () => {
            return util.zipDirectoryToFile('${__dirname}/myfakedir/', zippedPath)
                .then(() => {
                    expect(true).to.equal(false); // Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain('Directory path to be zipped does not exist');
                });
        });
    });

    describe('getBindContextName', () => {
        it('should return a string containing both services in the binding', () => {
            const name = util.getBindContextName('A', 'B');
            expect(name).to.equal('B->A');
        });
    });

    describe('getConsumeEventsContextName', () => {
        it('should return a string containing both the consumer and producer', () => {
            const name = util.getConsumeEventsContextName('A', 'B');
            expect(name).to.equal('A->B');
        });
    });

    describe('getProduceEventsContextName', () => {
        it('should return a string containing both the producer and consumer', () => {
            const name = util.getProduceEventsContextName('B', 'A');
            expect(name).to.equal('B->A');
        });
    });

    describe('getHandelFileParser', () => {
        const handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
        const handelFileParser = util.getHandelFileParser(handelFile);
        expect(handelFile).to.not.equal(null);
    });

    describe('createEnvironmentContext', () => {
        const handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
        const handelFileParser = util.getHandelFileParser(handelFile);
        const accountConfig = util.readYamlFileSync(`${__dirname}/../test-account-config.yml`);
        const environmentName = 'dev';

        const environmentContext = util.createEnvironmentContext(handelFile, handelFileParser, environmentName, accountConfig);
        expect(environmentContext).to.be.instanceof(EnvironmentContext);
    });
});
