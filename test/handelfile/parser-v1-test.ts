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
import config from '../../src/account-config/account-config';
import { AccountConfig, HandelFile, ServiceDeployers } from '../../src/datatypes/index';
import * as parserV1 from '../../src/handelfile/parser-v1';

describe('parser-v1', () => {
    let serviceDeployers: ServiceDeployers;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);

        serviceDeployers = {
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
        };
    });

    describe('validateHandelFile', () => {
        let validHandelFile: HandelFile;

        beforeEach(() => {
            validHandelFile = {
                version: 1,
                name: 'my-app-name',
                environments: {
                    dev: {
                        webapp: {
                            type: 'apigateway'
                        },
                        table: {
                            type: 'dynamodb'
                        }
                    }
                }
            };
        });

        it('should complain about a missing version', () => {
            delete validHandelFile.version;
            const errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('\'version\' field is required');
        });

        it('should complain about a missing name field', () => {
            delete validHandelFile.name;
            const errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('\'name\' field is required');
        });

        it('should complain about a name field that doesnt match the regex', () => {
            validHandelFile.name = 'invalid_name';
            const errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('\'name\' field may only use alphanumeric characters and dashes');
        });

        it('should complain about a name field that is too long', () => {
            validHandelFile.name = 'thisfieldiswaytolongofanameanditisgettinglongerandlongerbytheday';
            const errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('\'name\' field may not be greater');
        });

        it('should complain about a missing environments field', () => {
            delete validHandelFile.environments;
            const errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('\'environments\' field is required');
        });

        it('should complain about an empty environments field', () => {
            validHandelFile.environments = {};
            const errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('\'environments\' field must contain at least 1 environment definition');
        });

        it('should complain about an environment name that contains the wrong characters', () => {
            validHandelFile.environments.dev_test = validHandelFile.environments.dev;
            const errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('Environment name fields may only contain alphanumeric characters and dashes, and be no greater than 10 characters in length');
        });

        it('should complain about an environment name that is too long', () => {
            validHandelFile.environments.thisfieldiswaytolongofanameanditisgettinglongerandlongerbytheday = validHandelFile.environments.dev;
            const errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('Environment name fields may only contain alphanumeric characters and dashes, and be no greater than 10 characters in length');
        });

        it('should complain about a service name that contains the wrong characters', () => {
            validHandelFile.environments.dev.other_service = validHandelFile.environments.dev.webapp;
            const errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('Service name fields may only contain alphanumeric characters and dashes, and be no greater than 20 characters in length');
        });

        it('should complain about a service name that is too long', () => {
            validHandelFile.environments.dev.thisfieldiswaytolongofanameanditisgettinglongerandlongerbytheday = validHandelFile.environments.dev.webapp;
            const errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('Service name fields may only contain alphanumeric characters and dashes, and be no greater than 20 characters in length');
        });

        it('should complain about a service that doesnt contain the type field', () => {
            delete validHandelFile.environments.dev.webapp.type;
            const errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('\'type\' field is required in each service definition');
        });

        it('should complain if an unsupported service type is specified', () => {
            validHandelFile.environments.dev.webapp.type = 'unsupportedtype';
            const errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('Unsupported service type specified');
        });

        it('should complain about a service that depends on a service it cant consume', () => {
            validHandelFile.environments.dev.table.dependencies = [
                'webapp' // Dynamo can't depend on API Gateway
            ];
            const errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'apigateway\' service type is not consumable by the \'dynamodb\' service type');
        });

        it('should complain about a service that produces events to a service that cant consume them', () => {
            validHandelFile.environments.dev.table.event_consumers = [
                {
                    service_name: 'webapp'
                }
            ];
            const errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'apigateway\' service type can\'t consume events from the \'dynamodb\' service type');
        });

        it('should work on a handel file that has valid top-level information', () => {
            const errors = parserV1.validateHandelFile(validHandelFile, serviceDeployers);
            expect(errors.length).to.equal(0);
        });
    });

    describe('createEnvironmentContext', () => {
        it('should build the environment context from the deploy spec', () => {
            const handelFile: HandelFile = {
                version: 1,
                name: 'test',
                environments: {
                    dev: {
                        A: {
                            type: 'dynamodb'
                        }
                    }
                }
            };
            const environmentContext = parserV1.createEnvironmentContext(handelFile, 'dev', accountConfig);
            expect(environmentContext.appName).to.equal('test');
            expect(environmentContext.environmentName).to.equal('dev');
            expect(environmentContext.serviceContexts.A.serviceType).to.equal('dynamodb');
        });
    });
});
