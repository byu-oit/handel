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
const parserV1 = require('../../lib/handelfile/parser-v1');
const expect = require('chai').expect;

describe('parser-v1', function () {
    let serviceDeployers = {
        lambda: {
            producedDeployOutputTypes: [],
            consumedDeployOutputTypes: [
                'environmentVariables',
                'policies'
            ],
            producedEventsSupportedServices: []
        },
        dynamodb: {
            producedDeployOutputTypes: [
                'environmentVariables',
                'policies'
            ],
            consumedDeployOutputTypes: [],
            producedEventsSupportedServices: [
                'lambda'
            ]
        },
        ecs: {
            producedDeployOutputTypes: [],
            consumedDeployOutputTypes: [
                'environmentVariables',
                'scripts',
                'policies',
                'securityGroups'
            ],
            producedEventsSupportedServices: []
        },
        efs: {
            producedDeployOutputTypes: [
                'environmentVariables',
                'scripts',
                'securityGroups'
            ],
            consumedDeployOutputTypes: [],
            producedEventsSupportedServices: []
        },
        apigateway: {
            producedDeployOutputTypes: [],
            consumedDeployOutputTypes: [
                'environmentVariables',
                'policies'
            ],
            producedEventsSupportedServices: []
        }
    }


    describe('validateHandelFile', function () {
        let validHandelFile;

        beforeEach(function () {
            validHandelFile = {
                version: 1,
                name: "my-app-name",
                environments: {
                    dev: {
                        webapp: {
                            type: "apigateway",
                            some: "param"
                        },
                        table: {
                            type: "dynamodb",
                            other: "param"
                        }
                    }
                }
            }
        });

        it('should complain about a missing version', function () {
            delete validHandelFile.version;
            let errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("'version' field is required");
        });

        it('should complain about a missing name field', function () {
            delete validHandelFile.name;
            let errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("'name' field is required");
        });

        it('should complain about a name field that doesnt match the regex', function () {
            validHandelFile.name = "invalid_name";
            let errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("'name' field may only use alphanumeric characters and dashes");
        });

        it('should complain about a name field that is too long', function () {
            validHandelFile.name = "thisfieldiswaytolongofanameanditisgettinglongerandlongerbytheday";
            let errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("'name' field may not be greater");
        });

        it('should complain about a missing environments field', function () {
            delete validHandelFile.environments;
            let errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("'environments' field is required");
        });

        it('should complain about an empty environments field', function () {
            validHandelFile.environments = {};
            let errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("'environments' field must contain at least 1 environment definition");
        });

        it('should complain about an environment name that contains the wrong characters', function () {
            validHandelFile.environments.dev_test = validHandelFile.environments.dev;
            let errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("Environment name fields may only contain alphanumeric characters and dashes, and be no greater than 10 characters in length");
        });

        it('should complain about an environment name that is too long', function () {
            validHandelFile.environments['thisfieldiswaytolongofanameanditisgettinglongerandlongerbytheday'] = validHandelFile.environments.dev;
            let errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("Environment name fields may only contain alphanumeric characters and dashes, and be no greater than 10 characters in length");
        });

        it('should complain about a service name that contains the wrong characters', function () {
            validHandelFile.environments.dev.other_service = validHandelFile.environments.dev.webapp;
            let errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("Service name fields may only contain alphanumeric characters and dashes, and be no greater than 20 characters in length");
        });

        it('should complain about a service name that is too long', function () {
            validHandelFile.environments.dev['thisfieldiswaytolongofanameanditisgettinglongerandlongerbytheday'] = validHandelFile.environments.dev.webapp;
            let errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("Service name fields may only contain alphanumeric characters and dashes, and be no greater than 20 characters in length");
        });

        it('should complain about a service that doesnt contain the type field', function () {
            delete validHandelFile.environments.dev.webapp.type;
            let errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("'type' field is required in each service definition");
        });

        it('should complain if an unsupported service type is specified', function () {
            validHandelFile.environments.dev.webapp.type = "unsupportedtype";
            let errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("Unsupported service type specified");
        });

        it('should complain about a service that depends on a service it cant consume', function () {
            validHandelFile.environments.dev.table.dependencies = [
                "webapp" //Dynamo can't depend on API Gateway
            ]
            let errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'apigateway' service type is not consumable by the 'dynamodb' service type");
        });

        it('should complain about a service that produces events to a service that cant consume them', function () {
            validHandelFile.environments.dev.table.event_consumers = [
                {
                    service_name: "webapp"
                }
            ]
            let errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'apigateway' service type can't consume events from the 'dynamodb' service type");
        });

        it('should work on a handel file that has valid top-level information', function () {
            let errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(0);
        });
    });

    describe('createEnvironmentContext', function () {
        it("should build the environment context from the deploy spec", function () {
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