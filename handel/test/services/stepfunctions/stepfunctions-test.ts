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
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as iamCalls from '../../../src/aws/iam-calls';
import * as deletePhasesCommon from '../../../src/common/delete-phases-common';
import * as deployPhaseCommon from '../../../src/common/deploy-phase-common';
import { AccountConfig, DeployContext, ServiceContext, PreDeployContext, UnDeployContext } from '../../../src/datatypes';
import * as stepfunctions from '../../../src/services/stepfunctions';
import { StepFunctionsConfig } from '../../../src/services/stepfunctions/config-types';
import * as util from '../../../src/common/util';

describe('stepfunctions deployer', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<StepFunctionsConfig>;
    let serviceParams: StepFunctionsConfig;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        serviceParams = {
            type: 'stepfunctions',
            definition: ''
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', 'stepfunctions', serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('check', () => {
        it('should require the definition parameter', () => {
            delete serviceContext.params.definition;
            const errors = stepfunctions.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain("'definition' parameter is required");
        });

        it('should require the definition file to be JSON or YAML', () => {
            serviceContext.params.definition = 'state_machine';
            const errors = stepfunctions.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('file extension');
        });

        it('should accept valid JSON', () => {
            serviceContext.params.definition = 'state_machine.json';
            sandbox.stub(util, 'readJsonFileSync').returns({});
            const errors = stepfunctions.check(serviceContext, []);
            expect(errors.length).to.equal(0);
        })

        it('should require JSON definition to be valid JSON', () => {
            serviceContext.params.definition = 'somfile.json'
            sandbox.stub(util, 'readJsonFileSync').returns(null);
            const errors = stepfunctions.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('valid JSON');
        });

        it('should accept valid YAML', () => {
            serviceContext.params.definition = 'state_machine.yml';
            sandbox.stub(util, 'readYamlFileSync').returns({});
            const errors = stepfunctions.check(serviceContext, []);
            expect(errors.length).to.equal(0);
        })

        it('should require YAML definition to be valid YAML', () => {
            serviceContext.params.definition = 'state_machine.yml'
            sandbox.stub(util, 'readYamlFileSync').returns(null);
            const errors = stepfunctions.check(serviceContext, []);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.contain('valid YAML');
        })
    });

    describe('deploy', () => {
        const alphaLambdaArn = 'arn:aws:lambda:region:account-id:function:alpha-lambda'
        const betaLambdaArn = 'arn:aws:lambda:region:account-id:function:beta-lambda'
        function getDependenciesDeployContexts(): DeployContext[] {
            const dependenciesDeployContexts: DeployContext[] = [];

            const dependencies = [['alpha-lambda', alphaLambdaArn], ['beta-lambda', betaLambdaArn]];
            for (const [serviceName, functionArn] of dependencies) {
                const otherServiceContext = new ServiceContext(appName, envName, serviceName, 'lambda', {type: 'lambda'}, serviceContext.accountConfig);
                const deployContext = new DeployContext(otherServiceContext);
                deployContext.eventOutputs.lambdaArn = functionArn;
                dependenciesDeployContexts.push(deployContext);
            }

            return dependenciesDeployContexts;
        }

        it('should deploy the state machine', async () => {
            const stateMachineArn = 'StateMachineArn';
            const stateMachineName = 'StateMachineName';
            const deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').resolves({
                Outputs: [
                    {
                        OutputKey: 'StateMachineArn',
                        OutputValue: stateMachineArn
                    },
                    {
                        OutputKey: 'StateMachineName',
                        OutputValue: stateMachineName
                    }
                ]
            });
            const readYamlFileSyncStub = sandbox.stub(util, 'readYamlFileSync').returns({
                Start: 'AlphaState',
                States: {
                    AlphaState: {
                        Type: 'Task',
                        Resource: 'alpha-lambda',
                        Next: 'BetaState'
                    },
                    BetaState: {
                        Type: 'Task',
                        Resource: 'beta-lambda',
                        End: true
                    }
                }
            });
            const dependenciesDeployContexts = getDependenciesDeployContexts();
            const deployContext = await stepfunctions.deploy(serviceContext, new PreDeployContext(serviceContext), dependenciesDeployContexts);
            expect(deployContext).to.be.instanceof(DeployContext);
            expect(deployContext.eventOutputs.stateMachineArn).to.equal(stateMachineArn);
            expect(deployContext.eventOutputs.stateMachineName).to.equal(stateMachineName);
            expect(deployStackStub.callCount).to.equal(1);
            expect(readYamlFileSyncStub.callCount).to.equal(1);
            const template = deployStackStub.getCall(0).args[1];
            expect(template).to.contain(alphaLambdaArn);
            expect(template).to.contain(betaLambdaArn);
        });
    });

    describe('unDeploy', () => {
        it('should delete the stack', async () => {
            const detachPoliciesFromRoleStub = sandbox.stub(iamCalls, 'detachPoliciesFromRole').resolves();
            const unDeployStack = sandbox.stub(deletePhasesCommon, 'unDeployService').resolves(new UnDeployContext(serviceContext));

            const unDeployContext = await stepfunctions.unDeploy(serviceContext);
            expect(unDeployContext).to.be.instanceof(UnDeployContext);
            expect(unDeployStack.callCount).to.equal(1);
            expect(detachPoliciesFromRoleStub.callCount).to.equal(1);
        });
    });
});
