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
const expect = require('chai').expect;
const cli = require('../../lib/cli');
const sinon = require('sinon');
const fs = require('fs');
const util = require('../../lib/common/util');
const accountConfig = require('../../lib/common/account-config')(`${__dirname}/../test-account-config.yml`);

describe('cli module', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    // describe('validateAccountConfigParam', function () {
    //     it('should return no errors if the accuont config file exists', function () {
    //         let existsStub = sandbox.stub(fs, 'existsSync').returns(false);

    //         let accountConfig = 'dGVzdDogc29tZXRoaW5n'; //Base-64 encoded string of simple YAML file

    //         let errors = cli.validateAccountConfigParam(accountConfig);
    //         expect(errors.length).to.equal(0);
    //         expect(existsStub.calledOnce).to.be.true;
    //     });

    //     it('should return an error if the file is not valid YAML', function () {
    //         let existsStub = sandbox.stub(fs, 'existsSync').returns(false);

    //         let accountConfig = 'SomeFakeString'; //Wont decode to valid yaml file

    //         let errors = cli.validateAccountConfigParam(accountConfig);
    //         expect(errors.length).to.equal(1);
    //         expect(existsStub.calledOnce).to.be.true;
    //     });
    // });

    // describe('validateEnvsInHandelFile', function () {
    //     it('should return an error when the env doesnt exist', function () {
    //         let envsToDeploy = 'dev,fake';
    //         let handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);

    //         let errors = cli.validateEnvsInHandelFile(envsToDeploy, handelFile);
    //         expect(errors.length).to.equal(1);
    //     });

    //     it('should return no errors when the envs all exist', function() {
    //         let envsToDeploy = 'dev,prod';
    //         let handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);

    //         let errors = cli.validateEnvsInHandelFile(envsToDeploy, handelFile);
    //         expect(errors.length).to.equal(0);
    //     });
    // });

    describe('validateDeployArgs', function() {
        let handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
        it('should fail if the -c param is not provided', function() {
            let argv = {
                e: "dev,prod",
                v: "1",
            }
            let errors = cli.validateDeployArgs(argv, handelFile);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'-c' parameter is required`);
        });

        it('should fail if the -e parameter is not provided', function() {
            let argv = {
                v: "1",
                c: `${__dirname}/../test-account-config.yml`
            }
            let errors = cli.validateDeployArgs(argv, handelFile);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'-e' parameter is required`);
        });

        it('should fail if the -v param is not provided', function() {
            let argv = {
                e: "dev,prod",
                c: `${__dirname}/../test-account-config.yml`
            }
            let errors = cli.validateDeployArgs(argv, handelFile);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'-v' parameter is required`);
        });

        it('should suceed if all params are provided', function() {
            let argv = {
                e: "dev,prod",
                c: `${__dirname}/../test-account-config.yml`,
                v: "1"
            }
            let errors = cli.validateDeployArgs(argv, handelFile);
            expect(errors.length).to.equal(0);
        });
    });

    describe('validateDeleteArgs', function() {
        let handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
        it('should fail if the -c param is not provided', function() {
            let argv = {
                e: "dev,prod"
            }
            let errors = cli.validateDeleteArgs(argv, handelFile);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'-c' parameter is required`);
        });

        it('should fail if the -e parameter is not provided', function() {
            let argv = {
                c: `${__dirname}/../test-account-config.yml`
            }
            let errors = cli.validateDeleteArgs(argv, handelFile);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain(`'-e' parameter is required`);
        });

        it('should succeed if all params are provided', function() {
            let argv = {
                e: "dev,prod",
                c: `${__dirname}/../test-account-config.yml`
            }
            let errors = cli.validateDeleteArgs(argv, handelFile);
            expect(errors.length).to.equal(0);
        });
    });
});