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
import { expect } from 'chai';
import * as fs from 'fs';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import * as cloudformationCalls from '../../src/aws/cloudformation-calls';
import * as iamCalls from '../../src/aws/iam-calls';
import * as s3Calls from '../../src/aws/s3-calls';
import * as deployPhaseCommon from '../../src/common/deploy-phase-common';
import * as util from '../../src/common/util';
import { AccountConfig, DeployContext, ServiceConfig, ServiceContext } from '../../src/datatypes';

describe('Deploy phase common module', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<ServiceConfig>;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';
    const serviceName = 'FakeService';

    beforeEach(async () => {
        const retAccountConfig = await config(`${__dirname}/../test-account-config.yml`);
        sandbox = sinon.sandbox.create();
        accountConfig = retAccountConfig;
        serviceContext = new ServiceContext(appName, envName, serviceName, 'FakeType', {type: 'FakeType'}, retAccountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getInjectedEnvVarsFor', () => {
        it('should return environment variables with the service name', () => {
            const vars = deployPhaseCommon.getInjectedEnvVarsFor(serviceContext, { FOO: 'bar' });
            expect(vars).to.have.property('FAKESERVICE_FOO', 'bar');
        });
    });

    describe('getSsmParamName', () => {
        it('should return a consistent name for SSM params', () => {
            const paramName = deployPhaseCommon.getSsmParamName(serviceContext, 'myparamname');
            expect(paramName).to.equal('FakeApp.FakeEnv.FakeService.myparamname');
        });
    });

    describe('getEnvVarsFromServiceContext', () => {
        it('should return an object with the env vars to inject from the service context', () => {
            const returnEnvVars = deployPhaseCommon.getEnvVarsFromServiceContext(serviceContext);
            expect(returnEnvVars.HANDEL_APP_NAME).to.equal(appName);
            expect(returnEnvVars.HANDEL_ENVIRONMENT_NAME).to.equal(envName);
            expect(returnEnvVars.HANDEL_SERVICE_NAME).to.equal(serviceName);
            expect(returnEnvVars.HANDEL_PARAMETER_STORE_PREFIX).to.equal(`${appName}.${envName}`);
        });
    });

    describe('getEnvVarsFromDependencyDeployContexts', () => {
        it('should return an object with the env vars from all given DeployContexts', () => {
            const deployContexts = [];
            const serviceContext1 = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService1', 'FakeType1', {type: 'FakeType1'}, serviceContext.accountConfig);
            const deployContext1 = new DeployContext(serviceContext1);
            const envVarName1 = 'ENV_VAR_1';
            const envVarValue1 = 'someValue1';
            deployContext1.environmentVariables[envVarName1] = envVarValue1;
            deployContexts.push(deployContext1);

            const serviceContext2 = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService2', 'FakeType2', {type: 'FakeType2'}, serviceContext.accountConfig);
            const deployContext2 = new DeployContext(serviceContext2);
            const envVarName2 = 'ENV_VAR_2';
            const envVarValue2 = 'someValue2';
            deployContext2.environmentVariables[envVarName2] = envVarValue2;
            deployContexts.push(deployContext2);

            const returnVars = deployPhaseCommon.getEnvVarsFromDependencyDeployContexts(deployContexts);

            expect(returnVars[envVarName1]).to.equal(envVarValue1);
            expect(returnVars[envVarName2]).to.equal(envVarValue2);
        });
    });

    describe('createCustomRole', () => {
        it('should create the role if it doesnt exist', async () => {
            const createRoleStub = sandbox.stub(iamCalls, 'createRole').resolves({});
            const createOrUpdatePolicy = sandbox.stub(iamCalls, 'createOrUpdatePolicy').resolves({
                Arn: 'FakeArn'
            });
            const attachPolicyStub = sandbox.stub(iamCalls, 'attachPolicyToRole').resolves({});
            const getRoleStub = sandbox.stub(iamCalls, 'getRole').resolves(null);

            const role = await deployPhaseCommon.createCustomRole('ecs.amazonaws.com', 'MyRole', [{}], accountConfig);
            expect(getRoleStub.callCount).to.equal(2);
            expect(createRoleStub.callCount).to.equal(1);
            expect(createOrUpdatePolicy.callCount).to.equal(1);
            expect(attachPolicyStub.callCount).to.equal(1);
        });

        it('should return the role if it already exists', async () => {
            const createRoleStub = sandbox.stub(iamCalls, 'createRoleIfNotExists').returns(Promise.resolve({}));
            const getRoleStub = sandbox.stub(iamCalls, 'getRole').returns(Promise.resolve({}));

            const role = await deployPhaseCommon.createCustomRole('ecs.amazonaws.com', 'MyRole', [], accountConfig);
            expect(getRoleStub.callCount).to.equal(1);
            expect(createRoleStub.callCount).to.equal(0);
            expect(role).to.deep.equal({});
        });
    });

    describe('getAllPolicyStatementsForServiceRole', () => {
        it('should return the combination of policy statements from the own service and its dependencies', () => {
            const ownServicePolicyStatements = [{
                'Effect': 'Allow',
                'Action': [
                    'logs:CreateLogGroup',
                    'logs:CreateLogStream',
                    'logs:PutLogEvents'
                ],
                'Resource': [
                    'arn:aws:logs:*:*:*'
                ]
            }];

            const dependenciesDeployContexts = [];
            const dependencyServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'sqs', {type: 'sqs'}, serviceContext.accountConfig);
            const dependencyDeployContext = new DeployContext(dependencyServiceContext);
            dependencyDeployContext.policies.push({
                'Effect': 'Allow',
                'Action': [
                    'sqs:ChangeMessageVisibility',
                    'sqs:ChangeMessageVisibilityBatch',
                    'sqs:DeleteMessage',
                    'sqs:DeleteMessageBatch',
                    'sqs:GetQueueAttributes',
                    'sqs:GetQueueUrl',
                    'sqs:ListDeadLetterSourceQueues',
                    'sqs:ListQueues',
                    'sqs:PurgeQueue',
                    'sqs:ReceiveMessage',
                    'sqs:SendMessage',
                    'sqs:SendMessageBatch'
                ],
                'Resource': [
                    'SomeQueueArn'
                ]
            });
            dependenciesDeployContexts.push(dependencyDeployContext);

            const policyStatements = deployPhaseCommon.getAllPolicyStatementsForServiceRole(ownServicePolicyStatements, dependenciesDeployContexts);
            expect(policyStatements.length).to.equal(2);
        });
    });

    describe('deployCloudFormationStack', () => {
        it('should create the stack if it doesnt exist yet', async () => {
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            const createStackStub = sandbox.stub(cloudformationCalls, 'createStack').returns(Promise.resolve({}));
            const deployedStack = await deployPhaseCommon.deployCloudFormationStack('FakeStack', '', [], true, 'FakeService', {});
            expect(deployedStack).to.deep.equal({});
            expect(getStackStub.callCount).to.equal(1);
            expect(createStackStub.callCount).to.equal(1);
        });

        it('should update the stack if it exists and updates are supported', async () => {
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            const updateStackStub = sandbox.stub(cloudformationCalls, 'updateStack').returns(Promise.resolve({}));
            const deployedStack = await deployPhaseCommon.deployCloudFormationStack('FakeStack', '', [], true, 'FakeService', {});
            expect(deployedStack).to.deep.equal({});
            expect(getStackStub.callCount).to.equal(1);
            expect(updateStackStub.callCount).to.equal(1);
        });

        it('should just return the stack if it exists and updates are not supported', async () => {
            const getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            const updateStackStub = sandbox.stub(cloudformationCalls, 'updateStack').returns(Promise.resolve(null));
            const deployedStack = await deployPhaseCommon.deployCloudFormationStack('FakeStack', '', [], false, 'FakeService', {});
            expect(deployedStack).to.deep.equal({});
            expect(getStackStub.callCount).to.equal(1);
            expect(updateStackStub.callCount).to.equal(0);
        });
    });

    describe('uploadFileToHandelBucket', () => {
        it('should upload the given file to the bucket', async () => {
            const diskFilePath = 'FakePath';
            const artifactPrefix = 'FakePrefix';
            const s3FileName = 'SomeFileName';

            // Stub out dependent services
            const createBucketStub = sandbox.stub(s3Calls, 'createBucketIfNotExists').returns(Promise.resolve({}));
            const uploadFileStub = sandbox.stub(s3Calls, 'uploadFile').returns({});
            const cleanupOldVersionsStub = sandbox.stub(s3Calls, 'cleanupOldVersionsOfFiles').returns(Promise.resolve(null));

            const s3ObjectInfo = await deployPhaseCommon.uploadFileToHandelBucket(diskFilePath, artifactPrefix, s3FileName, serviceContext.accountConfig);
            expect(createBucketStub.callCount).to.equal(1);
            expect(uploadFileStub.callCount).to.equal(1);
            expect(cleanupOldVersionsStub.callCount).to.equal(1);
            expect(s3ObjectInfo).to.deep.equal({});
        });
    });

    describe('uploadDeployableArtifactToHandelBucket', () => {
        it('should upload a file to the given s3 location', async () => {
            const pathToArtifact = `${__dirname}/mytestartifact.war`;
            const s3FileName = 'FakeS3Filename';

            const createBucketStub = sandbox.stub(s3Calls, 'createBucketIfNotExists').resolves({});
            const uploadFileStub = sandbox.stub(s3Calls, 'uploadFile').resolves({});
            const cleanupFilesStub = sandbox.stub(s3Calls, 'cleanupOldVersionsOfFiles').resolves({});

            const s3ObjectInfo = await deployPhaseCommon.uploadDeployableArtifactToHandelBucket(serviceContext, pathToArtifact, s3FileName);
            expect(createBucketStub.callCount).to.equal(1);
            expect(uploadFileStub.callCount).to.equal(1);
            expect(cleanupFilesStub.callCount).to.equal(1);
            expect(s3ObjectInfo).to.deep.equal({});
        });

        it('should zip and upload a directory to the given s3 location', async () => {
            const pathToArtifact = __dirname;
            const s3FileName = 'FakeS3Filename';

            const zipDirectoryToFileStub = sandbox.stub(util, 'zipDirectoryToFile').returns(Promise.resolve({}));
            const createBucketStub = sandbox.stub(s3Calls, 'createBucketIfNotExists').resolves({});
            const uploadFileStub = sandbox.stub(s3Calls, 'uploadFile').resolves({});
            const cleanupFilesStub = sandbox.stub(s3Calls, 'cleanupOldVersionsOfFiles').resolves({});
            const unlinkSyncStub = sandbox.stub(fs, 'unlinkSync').returns(null);

            const s3ObjectInfo = await deployPhaseCommon.uploadDeployableArtifactToHandelBucket(serviceContext, pathToArtifact, s3FileName);
            expect(zipDirectoryToFileStub.callCount).to.equal(1);
            expect(createBucketStub.callCount).to.equal(1);
            expect(uploadFileStub.callCount).to.equal(1);
            expect(cleanupFilesStub.callCount).to.equal(1);
            expect(unlinkSyncStub.callCount).to.equal(1);
            expect(s3ObjectInfo).to.deep.equal({});
        });
    });

    describe('getAppSecretsAccessPolicyStatements', () => {
        it('should return an array of two permissions allowing it to access secrets in its namespace', () => {
            const policyStatements = deployPhaseCommon.getAppSecretsAccessPolicyStatements(serviceContext);
            expect(policyStatements.length).to.equal(2);
            expect(policyStatements[1].Resource[0]).to.contain(`parameter/${appName}.${envName}*`);
        });
    });

    describe('getResourceName', () => {
        it('should return a consistent name for Handel-created resources from the service context', () => {
            const resourceName = deployPhaseCommon.getResourceName(serviceContext);
            expect(resourceName).to.equal('FakeApp-FakeEnv-FakeService-FakeType');
        });
    });

    describe('getTags', () => {
        it('should return the Handel-injected tags, plus any user-defined tags', () => {
            serviceContext.params = {
                type: 'faketype',
                tags: {
                    mytag: 'myvalue'
                }
            };

            const returnTags = deployPhaseCommon.getTags(serviceContext);
            expect(returnTags.app).to.equal('FakeApp');
            expect(returnTags.env).to.equal('FakeEnv');
            expect(returnTags.mytag).to.equal('myvalue');
        });
    });
});
