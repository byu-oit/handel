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
import {expect} from 'chai';
import * as fs from 'fs';
import {
    AccountConfig,
    DeployContext,
    ServiceConfig,
    ServiceContext,
    ServiceType
} from 'handel-extension-api';
import * as extensionSupport from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import * as iamCalls from '../../src/aws/iam-calls';
import * as s3Calls from '../../src/aws/s3-calls';
import * as deployPhaseCommon from '../../src/common/deploy-phase-common';
import * as util from '../../src/common/util';
import { STDLIB_PREFIX } from '../../src/services/stdlib';

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
        serviceContext = new ServiceContext(appName, envName, serviceName, new ServiceType(STDLIB_PREFIX, 'FakeType'), {type: 'FakeType'}, retAccountConfig);
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
            const serviceContext1 = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService1', new ServiceType(STDLIB_PREFIX, 'FakeType1'), {type: 'FakeType1'}, serviceContext.accountConfig);
            const deployContext1 = new DeployContext(serviceContext1);
            const envVarName1 = 'ENV_VAR_1';
            const envVarValue1 = 'someValue1';
            deployContext1.environmentVariables[envVarName1] = envVarValue1;
            deployContexts.push(deployContext1);

            const serviceContext2 = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService2', new ServiceType(STDLIB_PREFIX, 'FakeType2'), {type: 'FakeType2'}, serviceContext.accountConfig);
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
            const dependencyServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 'sqs'), {type: 'sqs'}, serviceContext.accountConfig);
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

    describe('getAppSecretsAccessPolicyStatements', () => {
        it('should return an array of two permissions allowing it to access secrets in its namespace', () => {
            const policyStatements = deployPhaseCommon.getAppSecretsAccessPolicyStatements(serviceContext);
            expect(policyStatements.length).to.equal(3);
            expect(policyStatements[1].Resource[0]).to.contain(`parameter/${appName}.${envName}*`);
            expect(policyStatements[1].Resource[1]).to.contain(`parameter/handel.global*`);
        });
    });

});
