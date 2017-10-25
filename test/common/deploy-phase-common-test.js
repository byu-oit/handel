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
const ServiceContext = require('../../lib/datatypes/service-context');
const DeployContext = require('../../lib/datatypes/deploy-context');
const deployPhaseCommon = require('../../lib/common/deploy-phase-common');
const iamCalls = require('../../lib/aws/iam-calls');
const s3Calls = require('../../lib/aws/s3-calls');
const cloudformationCalls = require('../../lib/aws/cloudformation-calls');
const util = require('../../lib/common/util');
const fs = require('fs');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../lib/account-config/account-config');

describe('Deploy phase common module', function () {
    let sandbox;
    let serviceContext;
    let appName = "FakeApp";
    let envName = "FakeEnv";
    let serviceName = "FakeService";

    beforeEach(function () {
        return config(`${__dirname}/../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext(appName, envName, serviceName, "FakeType", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('getInjectedEnvVarsFor', function () {
        it('should return environment variables with the service name', function () {
            let vars = deployPhaseCommon.getInjectedEnvVarsFor(serviceContext, { FOO: 'bar' });
            expect(vars).to.have.property('FAKESERVICE_FOO', 'bar');
        });

        it('should return environment variables with the legacy format', function () {
            let vars = deployPhaseCommon.getInjectedEnvVarsFor(serviceContext, { FOO: 'bar' });
            expect(vars).to.have.property('FAKETYPE_FAKEAPP_FAKEENV_FAKESERVICE_FOO', 'bar');
        });
    });

    describe('getSsmParamName', function () {
        it('should return a consistent name for SSM params', function () {
            let paramName = deployPhaseCommon.getSsmParamName(serviceContext, 'myparamname');
            expect(paramName).to.equal("FakeApp.FakeEnv.FakeService.myparamname");
        });
    });

    describe('getEnvVarsFromServiceContext', function () {
        it('should return an object with the env vars to inject from the service context', function () {
            let returnEnvVars = deployPhaseCommon.getEnvVarsFromServiceContext(serviceContext);
            expect(returnEnvVars['HANDEL_APP_NAME']).to.equal(appName);
            expect(returnEnvVars['HANDEL_ENVIRONMENT_NAME']).to.equal(envName);
            expect(returnEnvVars['HANDEL_SERVICE_NAME']).to.equal(serviceName);
        });
    });

    describe('getEnvVarsFromDependencyDeployContexts', function () {
        it('should return an object with the env vars from all given DeployContexts', function () {
            let deployContexts = []
            let serviceContext1 = new ServiceContext("FakeApp", "FakeEnv", "FakeService1", "FakeType1", {}, serviceContext.accountConfig);
            let deployContext1 = new DeployContext(serviceContext1);
            let envVarName1 = "ENV_VAR_1";
            let envVarValue1 = "someValue1";
            deployContext1.environmentVariables[envVarName1] = envVarValue1;
            deployContexts.push(deployContext1);

            let serviceContext2 = new ServiceContext("FakeApp", "FakeEnv", "FakeService2", "FakeType2", {}, serviceContext.accountConfig);
            let deployContext2 = new DeployContext(serviceContext2);
            let envVarName2 = "ENV_VAR_2";
            let envVarValue2 = "someValue2";
            deployContext2.environmentVariables[envVarName2] = envVarValue2;
            deployContexts.push(deployContext2);

            let returnVars = deployPhaseCommon.getEnvVarsFromDependencyDeployContexts(deployContexts);

            expect(returnVars[envVarName1]).to.equal(envVarValue1);
            expect(returnVars[envVarName2]).to.equal(envVarValue2);
        });
    });

    describe('createCustomRole', function () {
        it('should create the role if it doesnt exist', function () {
            let createRoleStub = sandbox.stub(iamCalls, 'createRole').returns(Promise.resolve({}));
            let createOrUpdatePolicy = sandbox.stub(iamCalls, 'createOrUpdatePolicy').returns(Promise.resolve({
                Arn: "FakeArn"
            }));
            let attachPolicyStub = sandbox.stub(iamCalls, 'attachPolicyToRole').returns(Promise.resolve({}));
            let getRoleStub = sandbox.stub(iamCalls, 'getRole').returns(Promise.resolve(null));

            return deployPhaseCommon.createCustomRole("ecs.amazonaws.com", "MyRole", [{}], {})
                .then(role => {
                    expect(getRoleStub.callCount).to.equal(2);
                    expect(createRoleStub.callCount).to.equal(1);
                    expect(createOrUpdatePolicy.callCount).to.equal(1);
                    expect(attachPolicyStub.callCount).to.equal(1);
                });
        });

        it('should return the role if it already exists', function () {
            let createRoleStub = sandbox.stub(iamCalls, 'createRoleIfNotExists').returns(Promise.resolve({}));
            let getRoleStub = sandbox.stub(iamCalls, 'getRole').returns(Promise.resolve({}));

            return deployPhaseCommon.createCustomRole("ecs.amazonaws.com", "MyRole", [], {})
                .then(role => {
                    expect(getRoleStub.callCount).to.equal(1);
                    expect(createRoleStub.callCount).to.equal(0);
                    expect(role).to.deep.equal({});
                });
        });
    });

    describe('getAllPolicyStatementsForServiceRole', function () {
        it('should return the combination of policy statements from the own service and its dependencies', function () {
            let ownServicePolicyStatements = [{
                "Effect": "Allow",
                "Action": [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                ],
                "Resource": [
                    "arn:aws:logs:*:*:*"
                ]
            }];

            let dependenciesDeployContexts = [];
            let dependencyServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "sqs", {}, serviceContext.accountConfig);
            let dependencyDeployContext = new DeployContext(dependencyServiceContext);
            dependencyDeployContext.policies.push({
                "Effect": "Allow",
                "Action": [
                    "sqs:ChangeMessageVisibility",
                    "sqs:ChangeMessageVisibilityBatch",
                    "sqs:DeleteMessage",
                    "sqs:DeleteMessageBatch",
                    "sqs:GetQueueAttributes",
                    "sqs:GetQueueUrl",
                    "sqs:ListDeadLetterSourceQueues",
                    "sqs:ListQueues",
                    "sqs:PurgeQueue",
                    "sqs:ReceiveMessage",
                    "sqs:SendMessage",
                    "sqs:SendMessageBatch"
                ],
                "Resource": [
                    "SomeQueueArn"
                ]
            });
            dependenciesDeployContexts.push(dependencyDeployContext);

            let policyStatements = deployPhaseCommon.getAllPolicyStatementsForServiceRole(ownServicePolicyStatements, dependenciesDeployContexts);
            expect(policyStatements.length).to.equal(2);
        });
    });

    describe('deployCloudFormationStack', function () {
        it('should create the stack if it doesnt exist yet', function () {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudformationCalls, 'createStack').returns(Promise.resolve({}));
            return deployPhaseCommon.deployCloudFormationStack("FakeStack", "", [], true, "FakeService")
                .then(deployedStack => {
                    expect(deployedStack).to.deep.equal({});
                    expect(getStackStub.callCount).to.equal(1);
                    expect(createStackStub.callCount).to.equal(1);
                });
        });

        it('should update the stack if it exists and updates are supported', function () {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let updateStackStub = sandbox.stub(cloudformationCalls, 'updateStack').returns(Promise.resolve({}));
            return deployPhaseCommon.deployCloudFormationStack("FakeStack", "", [], true, "FakeService")
                .then(deployedStack => {
                    expect(deployedStack).to.deep.equal({});
                    expect(getStackStub.callCount).to.equal(1);
                    expect(updateStackStub.callCount).to.equal(1);
                });
        });

        it('should just return the stack if it exists and updates are not supported', function () {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let updateStackStub = sandbox.stub(cloudformationCalls, 'updateStack').returns(Promise.resolve(null));
            return deployPhaseCommon.deployCloudFormationStack("FakeStack", "", [], false, "FakeService")
                .then(deployedStack => {
                    expect(deployedStack).to.deep.equal({});
                    expect(getStackStub.callCount).to.equal(1);
                    expect(updateStackStub.callCount).to.equal(0);
                });
        });
    });

    describe('uploadFileToHandelBucket', function () {
        it('should upload the given file to the bucket', function () {
            let diskFilePath = "FakePath";
            let s3FileName = "SomeFileName";

            //Stub out dependent services
            let createBucketStub = sandbox.stub(s3Calls, 'createBucketIfNotExists').returns(Promise.resolve({}));
            let uploadFileStub = sandbox.stub(s3Calls, 'uploadFile').returns({});
            let cleanupOldVersionsStub = sandbox.stub(s3Calls, 'cleanupOldVersionsOfFiles').returns(Promise.resolve(null));

            return deployPhaseCommon.uploadFileToHandelBucket(serviceContext, diskFilePath, s3FileName, serviceContext.accountConfig)
                .then(s3ObjectInfo => {
                    expect(createBucketStub.callCount).to.equal(1);
                    expect(uploadFileStub.callCount).to.equal(1);
                    expect(cleanupOldVersionsStub.callCount).to.equal(1);
                    expect(s3ObjectInfo).to.deep.equal({});
                });
        });
    });

    describe('uploadDeployableArtifactToHandelBucket', function () {
        it('should upload a file to the given s3 location', function () {
            let pathToArtifact = `${__dirname}/mytestartifact.war`;
            let s3FileName = "FakeS3Filename";

            let uploadFileToHandelBucketStub = sandbox.stub(deployPhaseCommon, 'uploadFileToHandelBucket').returns(Promise.resolve({}));

            return deployPhaseCommon.uploadDeployableArtifactToHandelBucket(serviceContext, pathToArtifact, s3FileName)
                .then(s3ObjectInfo => {
                    expect(uploadFileToHandelBucketStub.callCount).to.equal(1);
                    expect(s3ObjectInfo).to.deep.equal({});
                });
        });

        it('should zip and upload a directory to the given s3 location', function () {
            let pathToArtifact = __dirname;
            let s3FileName = "FakeS3Filename";

            let zipDirectoryToFileStub = sandbox.stub(util, 'zipDirectoryToFile').returns(Promise.resolve({}));
            let uploadFileToHandelBucketStub = sandbox.stub(deployPhaseCommon, 'uploadFileToHandelBucket').returns(Promise.resolve({}));
            let unlinkSyncStub = sandbox.stub(fs, 'unlinkSync').returns(null);

            return deployPhaseCommon.uploadDeployableArtifactToHandelBucket(serviceContext, pathToArtifact, s3FileName)
                .then(s3ObjectInfo => {
                    expect(zipDirectoryToFileStub.callCount).to.equal(1);
                    expect(uploadFileToHandelBucketStub.callCount).to.equal(1);
                    expect(unlinkSyncStub.callCount).to.equal(1);
                    expect(s3ObjectInfo).to.deep.equal({});
                });
        });
    });

    describe('getAppSecretsAccessPolicyStatements', function () {
        it('should return an array of two permissions allowing it to access secrets in its namespace', function () {
            let policyStatements = deployPhaseCommon.getAppSecretsAccessPolicyStatements(serviceContext);
            expect(policyStatements.length).to.equal(2);
            expect(policyStatements[1].Resource[0]).to.contain(`parameter/${appName}.${envName}*`)
        });
    });

    describe('getResourceName', function () {
        it('should return a consistent name for Handel-created resources from the service context', function () {
            let resourceName = deployPhaseCommon.getResourceName(serviceContext);
            expect(resourceName).to.equal("FakeApp-FakeEnv-FakeService-FakeType");
        });
    });

    describe('getTags', function () {
        it('should return the Handel-injected tags, plus any user-defined tags', function () {
            serviceContext.params = {
                tags: {
                    mytag: 'myvalue'
                }
            }

            let returnTags = deployPhaseCommon.getTags(serviceContext);
            expect(returnTags.app).to.equal('FakeApp');
            expect(returnTags.env).to.equal("FakeEnv");
            expect(returnTags.mytag).to.equal('myvalue');
        });
    });
});