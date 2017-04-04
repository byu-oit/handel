const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const parserV1 = require('../../lib/handelfile/parser-v1');
const yaml = require('js-yaml');
const fs = require('fs');
const expect = require('chai').expect;

describe('parser-v1', function() {
    let serviceDeployers = {
        dynamodb: {
            producedDeployOutputTypes: [
                'environmentVariables',
                'policies'
            ],
            consumedDeployOutputTypes: []        
        },
        ecs: {
            producedDeployOutputTypes: [],
            consumedDeployOutputTypes: [
                'environmentVariables',
                'scripts',
                'policies',
                'securityGroups'
            ]
        },
        efs: {
            producedDeployOutputTypes: [
                'environmentVariables',
                'scripts',
                'securityGroups'
            ],
            consumedDeployOutputTypes: []
        },
        apigateway: {
            producedDeployOutputTypes: [],
            consumedDeployOutputTypes: [
                'environmentVariables',
                'policies'
            ]
        }
    }


    describe('validateHandelFile', function() {
        it('should complain about a missing version', function() {
            let handelFile = {}
            try {
                parserV1.validateHandelFile(handelFile, serviceDeployers);
                expect(true).to.be.false; //Should not get here
            }
            catch(e) {
                expect(e.message).to.include("'version' field is required");
            }
        });

        it('should complain about a missing name field', function() {
            let handelFile = {
                version: 1
            }
            try {
                parserV1.validateHandelFile(handelFile, serviceDeployers);
                expect(true).to.be.false; //Should not get here
            }
            catch(e) {
                expect(e.message).to.include("'name' field is required");
            }
        });

        it('should complain about a name field that doesnt match the regex', function() {   
            let handelFile = {
                version: 1,
                name: "some&bad$chars"
            }
            try {
                parserV1.validateHandelFile(handelFile, serviceDeployers);
                expect(true).to.be.false; //Should not get here
            }
            catch(e) {
                expect(e.message).to.include("'name' field may contain only alphanumeric");
            }
        });

        it('should complain about a name field that is too long', function() {
            let handelFile = {
                version: 1,
                name: "thisfieldiswaytolongofanameanditisgettinglongerandlongerbytheday"
            }
            try {
                parserV1.validateHandelFile(handelFile, serviceDeployers);
                expect(true).to.be.false; //Should not get here
            }
            catch(e) {
                expect(e.message).to.include("'name' field may not be greater");
            }
        });

        it('should complain about a missing environments field', function() {
            let handelFile = {
                version: 1,
                name: 'test'
            }
            try {
                parserV1.validateHandelFile(handelFile, serviceDeployers);
                expect(true).to.be.false; //Should not get here
            }
            catch(e) {
                expect(e.message).to.include("'environments' field is required");
            }
        });

        it('should complain about an empty environments field', function() {
            let handelFile = {
                version: 1,
                name: 'test',
                environments: {}
            }
            try {
                parserV1.validateHandelFile(handelFile, serviceDeployers);
                expect(true).to.be.false; //Should not get here
            }
            catch(e) {
                expect(e.message).to.include("'environments' field must contain");
            }
        });

        it('should complain about an environment name that contains the wrong characters', function() {
            let handelFile = {
                version: 1,
                name: 'test',
                environments: {
                    'jk$jk': {}
                }
            }
            try {
                parserV1.validateHandelFile(handelFile, serviceDeployers);
                expect(true).to.be.false; //Should not get here
            }
            catch(e) {
                expect(e.message).to.include("Environment name fields may only contain alphanumeric");
            }
        });

        it('should complain about an environment name that is too long', function() {
            let handelFile = {
                version: 1,
                name: 'test',
                environments: {
                    'thisfieldiswaytolongofanameanditisgettinglongerandlongerbytheday': {}
                }
            }
            try {
                parserV1.validateHandelFile(handelFile, serviceDeployers);
                expect(true).to.be.false; //Should not get here
            }
            catch(e) {
                expect(e.message).to.include("Environment name fields may not be greater than");
            }
        });

        it('should complain about a service name that contains the wrong characters', function() {
            let handelFile = {
                version: 1,
                name: 'test',
                environments: {
                    valid: {
                        'jk$jk': {}
                    }
                }
            }
            try {
                parserV1.validateHandelFile(handelFile, serviceDeployers);
                expect(true).to.be.false; //Should not get here
            }
            catch(e) {
                expect(e.message).to.include("Service name fields may only contain alphanumeric");
            }
        });

        it('should complain about a service name that is too long', function() {
            let handelFile = {
                version: 1,
                name: 'test',
                environments: {
                    valid: {
                        'thisfieldiswaytolongofanameanditisgettinglongerandlongerbytheday': {}
                    }
                }
            }
            try {
                parserV1.validateHandelFile(handelFile, serviceDeployers);
                expect(true).to.be.false; //Should not get here
            }
            catch(e) {
                expect(e.message).to.include("Service name fields may not be greater than");
            }
        });

        it('should complain about a service that doesnt contain the type field', function() {
            let handelFile = {
                version: 1,
                name: 'test',
                environments: {
                    valid: {
                        valid: {}
                    }
                }
            }
            try {
                parserV1.validateHandelFile(handelFile, serviceDeployers);
                expect(true).to.be.false; //Should not get here
            }
            catch(e) {
                expect(e.message).to.include("Services must declare service type in the 'type' field");
            }
        });

        it('should complain if an unsupported service type is specified', function() {
            let handelFile = {
                version: 1,
                name: 'test',
                environments: {
                    myenv: {
                        myunsupportedservice: {
                            type: 'unsupportedtype'
                        }
                    }
                }
            }
            try {
                parserV1.validateHandelFile(handelFile, serviceDeployers);
                expect(true).to.be.false; //Should not get here
            }
            catch(e) {
                expect(e.message).to.include("Unsupported service type specified");
            }
        });

        it('should complain about a service that depends on a service it cant consume', function() {
            let handelFile = {
                version: 1,
                name: 'test',
                environments: {
                    myenv: {
                        myapigateway: {
                            type: 'apigateway',
                            dependencies: [
                                'myefs'
                            ]
                        },
                        myefs: {
                            type: 'efs'
                        }
                    }
                }
            }
            try {
                parserV1.validateHandelFile(handelFile, serviceDeployers);
                expect(true).to.be.false; //Should not get here
            }
            catch(e) {
                expect(e.message).to.include("service type is not consumable");
            }
        });

        it('should work on a handel file that has valid top-level information', function() {
            let handelFile = {
                version: 1,
                name: 'test',
                environments: {
                    valid: {
                        valid: {
                            type: 'dynamodb'
                        }
                    }
                }
            }
            parserV1.validateHandelFile(handelFile, serviceDeployers);
        });
    });

    describe('createEnvironmentContext', function() {
        it("should build the environment context from the deploy spec", function() {
            let handelFile = {
                version: 1,
                name: 'test',
                environments: {
                    dev: {
                        A: {
                            type: 'dynamodb',
                            some: 'param'
                        }
                    }
                }
            };
            let environmentContext = parserV1.createEnvironmentContext(handelFile, "dev", "1");
            expect(environmentContext.appName).to.equal('test');
            expect(environmentContext.environmentName).to.equal('dev');
            expect(environmentContext.serviceContexts['A'].serviceType).to.equal('dynamodb');
        });
    });
});