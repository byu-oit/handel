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
import { DeployOutputType, ServiceEventType, ServiceRegistry } from 'handel-extension-api';
import { AccountConfig, ServiceType } from 'handel-extension-api';
import 'mocha';
import config from '../../src/account-config/account-config';
import { HandelCoreOptions, HandelFile } from '../../src/datatypes';
import * as parserV1 from '../../src/handelfile/parser-v1';
import { STDLIB_PREFIX } from '../../src/services/stdlib';
import FakeServiceRegistry from '../service-registry/fake-service-registry';

describe('parser-v1', () => {
    let serviceRegistry: ServiceRegistry;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);

        serviceRegistry = new FakeServiceRegistry({
            lambda: {
                producedDeployOutputTypes: [],
                consumedDeployOutputTypes: [
                    DeployOutputType.EnvironmentVariables,
                    DeployOutputType.Policies,
                ],
                providedEventType: ServiceEventType.Lambda,
                producedEventsSupportedTypes: [],
                supportsTagging: true,
            },
            dynamodb: {
                producedDeployOutputTypes: [
                    DeployOutputType.EnvironmentVariables,
                    DeployOutputType.Policies
                ],
                consumedDeployOutputTypes: [],
                providedEventType: ServiceEventType.DynamoDB,
                producedEventsSupportedTypes: [
                    ServiceEventType.Lambda
                ],
                supportsTagging: true,
            },
            ecs: {
                producedDeployOutputTypes: [],
                consumedDeployOutputTypes: [
                    DeployOutputType.EnvironmentVariables,
                    DeployOutputType.Scripts,
                    DeployOutputType.Policies,
                    DeployOutputType.SecurityGroups
                ],
                producedEventsSupportedTypes: [],
                supportsTagging: true,
            },
            efs: {
                producedDeployOutputTypes: [
                    DeployOutputType.EnvironmentVariables,
                    DeployOutputType.Scripts,
                    DeployOutputType.SecurityGroups
                ],
                consumedDeployOutputTypes: [],
                producedEventsSupportedTypes: [],
                supportsTagging: true,
            },
            apigateway: {
                producedDeployOutputTypes: [],
                consumedDeployOutputTypes: [
                    DeployOutputType.EnvironmentVariables,
                    DeployOutputType.Policies
                ],
                producedEventsSupportedTypes: [],
                supportsTagging: true,
            }
        });
    });

    describe('validateHandelFile', () => {
        let validHandelFile: HandelFile;

        beforeEach(() => {
            validHandelFile = {
                version: 1,
                name: 'my-app-name',
                tags: {
                    tag: 'value',
                    another_tag: 'another value'
                },
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

        it('should complain about a missing version', async () => {
            delete validHandelFile.version;
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('\'version\' field is required');
        });

        it('should complain about a missing name field', async () => {
            delete validHandelFile.name;
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('\'name\' field is required');
        });

        it('should complain about a name field that doesnt match the regex', async () => {
            validHandelFile.name = 'invalid_name';
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('\'name\' field may only use alphanumeric characters and dashes');
        });

        it('should complain about a name field that is too long', async () => {
            validHandelFile.name = 'thisfieldiswaytolongofanameanditisgettinglongerandlongerbytheday';
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('\'name\' field may not be greater');
        });

        it('should complain about a tag key that is too long', async () => {
            const tooLongName = 'a'.repeat(200);
            validHandelFile.tags = {[tooLongName]: 'foo'};

            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('maximum of 127 characters');
        });

        it('should complain about a tag key that has invalid characters', async () => {
            validHandelFile.tags = {'aa{}': 'foo'};

            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('consisting of numbers, letters, and some special characters');
        });

        it('should complain about an empty tag value', async () => {
            validHandelFile.tags = {'tag': ''};

            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('Tag values must have at least 1 character');
        });

        it('should complain about tag values that are too long', async () => {
            validHandelFile.tags = {'tag': 'a'.repeat(256)};

            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('Tag values may contain a maximum of 255 characters');
        });

        it('should complain about a missing environments field', async () => {
            delete validHandelFile.environments;
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('\'environments\' field is required');
        });

        it('should complain about an empty environments field', async () => {
            validHandelFile.environments = {};
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('\'environments\' field must contain at least 1 environment definition');
        });

        it('should complain about an environment name that contains the wrong characters', async () => {
            validHandelFile.environments.dev_test = validHandelFile.environments.dev;
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('Environment name fields may only contain alphanumeric characters and dashes, and be no greater than 10 characters in length');
        });

        it('should complain about an environment name that is too long', async () => {
            validHandelFile.environments.thisfieldiswaytolongofanameanditisgettinglongerandlongerbytheday = validHandelFile.environments.dev;
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('Environment name fields may only contain alphanumeric characters and dashes, and be no greater than 10 characters in length');
        });

        it('should complain about a service name that contains the wrong characters', async () => {
            validHandelFile.environments.dev.other_service = validHandelFile.environments.dev.webapp;
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('Service name fields may only contain alphanumeric characters and dashes, and be no greater than 20 characters in length');
        });

        it('should complain about a service name that is too long', async () => {
            validHandelFile.environments.dev.thisfieldiswaytolongofanameanditisgettinglongerandlongerbytheday = validHandelFile.environments.dev.webapp;
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('Service name fields may only contain alphanumeric characters and dashes, and be no greater than 20 characters in length');
        });

        it('should complain about a service that doesnt contain the type field', async () => {
            delete validHandelFile.environments.dev.webapp.type;
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('\'type\' field is required in each service definition');
        });

        it('should not allow the app name handel to be specified', async () => {
            validHandelFile.name = 'handel';
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`You may not use the name 'handel' for your app name`);
        });

        it('should complain if an unsupported service type is specified', async () => {
            validHandelFile.environments.dev.webapp.type = 'unsupportedtype';
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('Unsupported service type specified');
        });

        it('should complain about a service that depends on a service it cant consume', async () => {
            validHandelFile.environments.dev.table.dependencies = [
                'webapp' // Dynamo can't depend on API Gateway
            ];
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'apigateway\' service type is not consumable by the \'dynamodb\' service type');
        });

        it('should complain about a service that produces events to a service that cant consume them', async () => {
            validHandelFile.environments.dev.table.event_consumers = [
                {
                    service_name: 'webapp'
                }
            ];
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include('The \'apigateway\' service type can\'t consume events from the \'dynamodb\' service type');
        });

        it('should work on a handel file that has valid top-level information', async () => {
            const errors = await parserV1.validateHandelFile(validHandelFile, serviceRegistry);
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

            const opts: HandelCoreOptions = {linkExtensions: false};

            const environmentContext = parserV1.createEnvironmentContext(handelFile, 'dev', accountConfig, new FakeServiceRegistry(), opts);
            expect(environmentContext.appName).to.equal('test');
            expect(environmentContext.environmentName).to.equal('dev');
            expect(environmentContext.serviceContexts.A.serviceType).to.deep.equal(new ServiceType(STDLIB_PREFIX, 'dynamodb'));
            expect(environmentContext.options).to.deep.equal(opts);
        });
    });

    describe('listExtensions', () => {
        let validHandelFile: HandelFile;

        beforeEach(() => {
            validHandelFile = {
                version: 1,
                name: 'my-app-name',
                tags: {
                    tag: 'value',
                    another_tag: 'another value'
                },
                extensions: {
                    foo: 'foo-extension@^1.0.0',
                },
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

        it('Lists all extensions in a handel file', async () => {
            const extensions = await parserV1.listExtensions(validHandelFile);
            expect(extensions).to.have.lengthOf(1);
            expect(extensions).to.deep.include({
                prefix: 'foo',
                name: 'foo-extension',
                versionSpec: '^1.0.0'
            });
        });
        it('Handles extensions without a version', async () => {
            validHandelFile.extensions = {foo: 'foo-extension'};

            const extensions = await parserV1.listExtensions(validHandelFile);
            expect(extensions).to.have.lengthOf(1);
            expect(extensions).to.deep.include({
                prefix: 'foo',
                name: 'foo-extension',
                versionSpec: '*'
            });
        });
        it('Handles extensions with a scoped package name (issue #438)', async () => {
            const inputExtensions = validHandelFile.extensions!;
            inputExtensions.foo = '@test-org/foo-extension@^1.0.0';
            inputExtensions.bar = '@test-org/bar-extension';

            const extensions = await parserV1.listExtensions(validHandelFile);
            expect(extensions).to.deep.include({
                prefix: 'foo',
                name: '@test-org/foo-extension',
                versionSpec: '^1.0.0'
            });
            expect(extensions).to.deep.include({
                prefix: 'bar',
                name: '@test-org/bar-extension',
                versionSpec: '*'
            });
        });
    });
});
