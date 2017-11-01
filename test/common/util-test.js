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
const util = require('../../dist/common/util');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const expect = require('chai').use(sinonChai).expect;
const fs = require('fs');
const EnvironmentContext = require('../../dist/datatypes/environment-context');

describe('util module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('readDirSync', function () {
      it('should return null on an error', function () {
        sandbox.stub(fs, 'readdirSync').throws(new Error("someMessage"));
        let result = util.readDirSync('somePath');
        expect(result).to.be.null;
      });

      it('should return an array of names on success', function () {
        sandbox.stub(fs, 'readdirSync').returns([]);
        let result = util.readDirSync('somePath');
        expect(result).to.be.an('array');
      });
    });

    describe('readFileSync', function () {
        it('should return null on an error', function () {
            sandbox.stub(fs, 'readFileSync').throws(new Error("someMessage"));
            let result = util.readFileSync('somePath');
            expect(result).to.be.null;
        });

        it('should return the file contents on success', function () {
            sandbox.stub(fs, 'readFileSync').returns("");
            let result = util.readFileSync('somePath');
            expect(result).to.equal("");
        });
    });

    describe('writeFileSync', function () {
        it('should return null on an error', function () {
            sandbox.stub(fs, 'writeFileSync').throws(new Error("someMessage"));
            let result = util.writeFileSync('somePath');
            expect(result).to.be.null;
        });

        it('should return undefined on success', function () {
            sandbox.stub(fs, 'writeFileSync').returns(undefined);
            let result = util.writeFileSync('somePath');
            expect(result).to.be.undefined;
        });
    });

    describe('readJsonFileSync', function() {
        it('should return null on an error', function () {
            sandbox.stub(fs, 'readFileSync').throws(new Error("someMessage"));
            let result = util.readJsonFileSync('somePath');
            expect(result).to.be.null;
        });

        it('should return the yaml object on success', function () {
            sandbox.stub(fs, 'readFileSync').returns(`{"key": "value"}`);
            let result = util.readJsonFileSync('somePath');
            expect(result.key).to.equal("value");
        });
    });

    describe('readYamlFileSync', function () {
        it('should return null on an error', function () {
            sandbox.stub(fs, 'readFileSync').throws(new Error("someMessage"));
            let result = util.readYamlFileSync('somePath');
            expect(result).to.be.null;
        });

        it('should return the yaml object on success', function () {
            sandbox.stub(fs, 'readFileSync').returns("key: value");
            let result = util.readYamlFileSync('somePath');
            expect(result.key).to.equal("value");
        });
    });

    describe('readYamlFileAsync', function () {
        it('should return the yaml object on success', function () {
            sandbox.stub(fs, 'readFile').callsArgWith(2, null, "key: value");
            return util.readYamlFileAsync('somePath')
                .then(result => {
                    expect(result.key).to.equal("value");
                });
        })

        it('should return a rejected promise on error', function () {
            sandbox.stub(fs, 'readFile').callsArgWith(2, new Error("error"), null);
            return util.readYamlFileAsync('somePath')
                .then(result => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.equal("error");
                });
        });
    });

    describe('replaceTagInFile', function () {
        it('should replace regex strings in a file on success', function () {
            sandbox.stub(util, 'readFileSync').returns('This is a string with a <sub_var> replacement tag.');
            let stubWrite = sandbox.stub(util, 'writeFileSync').returns(undefined);
            let lstTag = [
              { regex: / a \<sub_var\>/g, value: 'out a' },
              { regex: / replacement/g, value: '' }
            ];
            let result = util.replaceTagInFile(lstTag,'somePath','someFile');
            expect(stubWrite).to.have.been.calledWith(sinon.match.string,'This is a string without a tag.');
        });

        it('should return null on error', function () {
            sandbox.stub(util, 'readFileSync').returns(null);
            let result = util.replaceTagInFile(null,'somePath','someFile')
            expect(result).to.be.null;
        });
    });
  
    describe('zipDirectoryToFile', function () {
        let zippedPath = `${__dirname}/zipped-test-file.zip`;

        afterEach(function () {
            if (fs.existsSync(zippedPath)) {
                fs.unlinkSync(zippedPath); //Ensure created ZIP archive gets deleted
            }
        });

        it('should zip the given directory if it exists', function () {
            return util.zipDirectoryToFile(__dirname, zippedPath)
                .then(() => {
                    expect(fs.existsSync(zippedPath)).to.be.true;
                });
        });

        it('should throw an error if the given directory doesnt exist', function () {
            return util.zipDirectoryToFile('${__dirname}/myfakedir/', zippedPath)
                .then(() => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain('Directory path to be zipped does not exist');
                });
        });
    });

    describe('getBindContextName', function () {
        it('should return a string containing both services in the binding', function () {
            let name = util.getBindContextName('A', 'B');
            expect(name).to.equal('B->A');
        });
    });

    describe('getConsumeEventsContextName', function () {
        it('should return a string containing both the consumer and producer', function () {
            let name = util.getConsumeEventsContextName('A', 'B');
            expect(name).to.equal('A->B');
        });
    });

    describe('getProduceEventsContextName', function () {
        it('should return a string containing both the producer and consumer', function () {
            let name = util.getProduceEventsContextName('B', 'A');
            expect(name).to.equal('B->A');
        });
    });

    describe('getHandelFileParser', function () {
        let handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
        let handelFileParser = util.getHandelFileParser(handelFile);
        expect(handelFile).to.not.be.null;
    });

    describe('createEnvironmentContext', function () {
        let handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
        let handelFileParser = util.getHandelFileParser(handelFile);
        let environmentName = "dev";

        let environmentContext = util.createEnvironmentContext(handelFile, handelFileParser, environmentName, {});
        expect(environmentContext).to.be.instanceof(EnvironmentContext);
    });
})
