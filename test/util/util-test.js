const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const util = require('../../lib/util/util');
const sinon = require('sinon');
const expect = require('chai').expect;
const fs = require('fs');
const ServiceContext = require('../../lib/datatypes/service-context');

describe('util module', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('readFileSync', function() {
        it('should return null on an error', function() {
            sandbox.stub(fs, 'readFileSync').throws(new Error("someMessage"));
            let result = util.readFileSync('somePath');
            expect(result).to.be.null;
        });

        it('should return the file contents on success', function() {
            sandbox.stub(fs, 'readFileSync').returns("");
            let result = util.readFileSync('somePath');
            expect(result).to.equal("");
        });
    });

    describe('readYamlFileSync', function() {
        it('should return null on an error', function() {
            sandbox.stub(fs, 'readFileSync').throws(new Error("someMessage"));
            let result = util.readYamlFileSync('somePath');
            expect(result).to.be.null;
        });

        it('should return the yaml object on success', function() {
            sandbox.stub(fs, 'readFileSync').returns("key: value");
            let result = util.readYamlFileSync('somePath');
            expect(result.key).to.equal("value");
        });
    });

    describe('readYamlFileAsync', function() {
        it('should return the yaml object on success', function() {
            sandbox.stub(fs, 'readFile').callsArgWith(2, null, "key: value");
            return util.readYamlFileAsync('somePath')
                .then(result => {
                    expect(result.key).to.equal("value");
                });
        })

        it('should return a rejected promise on error', function() {
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

    describe('zipDirectoryToFile', function() {
        let zippedPath = `${__dirname}/zipped-test-file.zip`;

        afterEach(function() {
            if(fs.existsSync(zippedPath)) {
                fs.unlinkSync(zippedPath); //Ensure created ZIP archive gets deleted
            }
        });

        it('should zip the given directory if it exists', function() {
            return util.zipDirectoryToFile(__dirname, zippedPath)
                .then(() => {
                    expect(fs.existsSync(zippedPath)).to.be.true;
                });
        });

        it('should throw an error if the given directory doesnt exist', function() {
            return util.zipDirectoryToFile('${__dirname}/myfakedir/', zippedPath)
                .then(() => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain('Directory path to be zipped does not exist');
                });
        });
    });

    describe('parseHashValue', function() {
        it('should return an object from the given URL with hash parameters', function() {
            let parsedValues = util.parseHashValue("someParam=someValue&someParam2=someValue2");
            expect(parsedValues.someParam).to.equal("someValue");
            expect(parsedValues.someParam2).to.equal("someValue2");
        });
    });

    describe('getExternalServiceContext', function() {
        it('should require the appName parameter', function() {
            let externalServiceRef = "https://fakeurl.github.com/fakeorg/fakerepo/master/handel.yml#environmentName=dev&serviceName=topic";
            return util.getExternalServiceContext(externalServiceRef, "1")
                .then(externalServiceContext => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain('Invalid external service reference. Must be of the following format');
                });
        });

        it('should require the environmentName parameter', function() {
            let externalServiceRef = "https://fakeurl.github.com/fakeorg/fakerepo/master/handel.yml#appName=handel-test&serviceName=topic";
            return util.getExternalServiceContext(externalServiceRef, "1")
                .then(externalServiceContext => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain('Invalid external service reference. Must be of the following format');
                });
        });

        it('should require the serviceName paramter', function() {
            let externalServiceRef = "https://fakeurl.github.com/fakeorg/fakerepo/master/handel.yml#appName=handel-test&environmentName=dev";
            return util.getExternalServiceContext(externalServiceRef, "1")
                .then(externalServiceContext => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain('Invalid external service reference. Must be of the following format');
                });
        });
        
        it('should return an error if the requested service isnt present in the external handel file', function() {
            let externalHandelFile = util.readFileSync(`${__dirname}/external-handel-file.yml`);
            let makeHttpRequestStub = sandbox.stub(util, 'makeHttpRequest').returns(Promise.resolve(externalHandelFile));

            let externalServiceRef = "https://fakeurl.github.com/fakeorg/fakerepo/master/handel.yml#appName=handel-test&environmentName=dev&serviceName=otherService";
            return util.getExternalServiceContext(externalServiceRef, "1")
                .then(externalServiceContext => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(makeHttpRequestStub.calledOnce).to.be.true;
                    expect(err.message).to.contain("Invalid external service reference. Make sure you are specifying the correct environment and service name");
                });
        });

        it('should return the service context from the given external reference', function() {
            let externalHandelFile = util.readFileSync(`${__dirname}/external-handel-file.yml`);
            let makeHttpRequestStub = sandbox.stub(util, 'makeHttpRequest').returns(Promise.resolve(externalHandelFile));

            let externalServiceRef = "https://fakeurl.github.com/fakeorg/fakerepo/master/handel.yml#appName=handel-test&environmentName=dev&serviceName=topic";
            return util.getExternalServiceContext(externalServiceRef, "1")
                .then(externalServiceContext => {
                    expect(makeHttpRequestStub.calledOnce).to.equal.true;
                    expect(externalServiceContext).to.be.instanceof(ServiceContext);
                    expect(externalServiceContext.serviceType).to.equal('sns');
                });
        });
    });
})