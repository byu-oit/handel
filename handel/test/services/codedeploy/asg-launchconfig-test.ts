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
import {
    AccountConfig,
    DeployContext,
    ServiceContext,
    ServiceType
} from 'handel-extension-api';
import { awsCalls, handlebars } from 'handel-extension-support';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as autoScalingCalls from '../../../src/aws/auto-scaling-calls';
import * as ec2Calls from '../../../src/aws/ec2-calls';
import * as instanceAutoScaling from '../../../src/common/instance-auto-scaling';
import { InstanceScalingPolicyType } from '../../../src/datatypes';
import * as asgLaunchConfig from '../../../src/services/codedeploy/asg-launchconfig';
import { CodeDeployServiceConfig } from '../../../src/services/codedeploy/config-types';
import { STDLIB_PREFIX } from '../../../src/services/stdlib';

describe('codedeploy asg-launchconfig config module', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<CodeDeployServiceConfig>;
    let serviceParams: CodeDeployServiceConfig;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        serviceParams = {
            type: 'codedeploy',
            path_to_code: '.',
            os: 'linux',
            instance_type: 't2.micro',
            key_name: 'mykey',
            auto_scaling: {
                min_instances: 1,
                max_instances: 4,
                scaling_policies: [
                    {
                        type: InstanceScalingPolicyType.UP,
                        adjustment: {
                            value: 1,
                            cooldown: 60
                        },
                        alarm: {
                            metric_name: 'CPUUtilization',
                            comparison_operator: 'GreaterThanThreshold',
                            threshold: 70,
                            period: 60
                        }
                    }
                ]
            },
        };
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', new ServiceType(STDLIB_PREFIX, 'codedeploy'), serviceParams, accountConfig);
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getAmiFromPrefix', () => {
        it('should return the latest AMI to use for the codedeploy service', async () => {
            const getAmiStub = sandbox.stub(ec2Calls, 'getLatestAmiByName').resolves({});
            const ami = await asgLaunchConfig.getCodeDeployAmi();
            expect(ami).to.deep.equal({});
            expect(getAmiStub.callCount).to.equal(1);
        });
    });

    describe('getAutoScalingConfig', () => {
        it('should return the config for codedeploy auto scaling', () => {
            const getScalingPoliciesStub = sandbox.stub(instanceAutoScaling, 'getScalingPoliciesConfig').returns([]);

            const autoScalingConfig = asgLaunchConfig.getAutoScalingConfig(serviceContext);
            expect(autoScalingConfig).to.deep.equal({
                minInstances: 1,
                maxInstances: 4,
                cooldown: '300',
                scalingPolicies: [] // This is tested in the instance-auto-scaling module, so we just stub out hte return here with empty list
            });
        });
    });

    describe('getUserDataScript', () => {
        it('should return the compiled userdata script', async () => {
            const deployContexts: DeployContext[] = [];
            const dependencyServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeDependencyService', new ServiceType(STDLIB_PREFIX, 'efs'), {type: 'efs'}, accountConfig);
            const dependencyDeployContext = new DeployContext(dependencyServiceContext);
            dependencyDeployContext.scripts.push('Some Bash Script');

            const compileTemplateStub = sandbox.stub(handlebars, 'compileTemplate').resolves('CompiledScript');

            const userDataScript = await asgLaunchConfig.getUserDataScript(serviceContext, deployContexts);
            expect(userDataScript).to.equal('CompiledScript');
            expect(compileTemplateStub.callCount).to.equal(2);
        });
    });

    describe('shouldRollInstances', () => {
        it('should return false if there is no existing stack yet', async () => {
            const amiToDeploy = {
                ImageId: 'OldId'
            };
            const response = await asgLaunchConfig.shouldRollInstances(serviceContext, amiToDeploy, null);
            expect(response).to.equal(false);
        });

        const shouldRollTestParams = [
            {
                changedField: 'the key name field',
                amiToDeploy: {
                    ImageId: 'OldId'
                },
                launchConfig: {
                    KeyName: 'oldkey',
                    InstanceType: 't2.micro',
                    ImageId: 'OldId'
                },
                returnValue: true
            },
            {
                changedField: 'the instance type field',
                amiToDeploy: {
                    ImageId: 'OldId'
                },
                launchConfig: {
                    KeyName: 'mykey',
                    InstanceType: 't2.medium',
                    ImageId: 'OldId'
                },
                returnValue: true
            },
            {
                changedField: 'the image id field',
                amiToDeploy: {
                    ImageId: 'NewId'
                },
                launchConfig: {
                    KeyName: 'mykey',
                    InstanceType: 't2.micro',
                    ImageId: 'OldId'
                },
                returnValue: true
            },
            {
                changedField: 'none of the fields',
                amiToDeploy: {
                    ImageId: 'OldId'
                },
                launchConfig: {
                    KeyName: 'mykey',
                    InstanceType: 't2.micro',
                    ImageId: 'OldId'
                },
                returnValue: false
            }
        ];
        shouldRollTestParams.forEach(testParams => {
            it(`should return ${testParams.returnValue} if ${testParams.changedField} has changed`, async () => {
                const getOutputStub = sandbox.stub(awsCalls.cloudFormation, 'getOutput').returns('FakeLaunchConfig');
                const getLaunchConfigStub = sandbox.stub(autoScalingCalls, 'getLaunchConfiguration').resolves(testParams.launchConfig);

                const existingStack: AWS.CloudFormation.Stack = {
                    StackName: 'ExistingStack',
                    CreationTime: new Date(),
                    StackStatus: 'UPDATE_COMPLETE'
                };

                const response = await asgLaunchConfig.shouldRollInstances(serviceContext, testParams.amiToDeploy, existingStack);
                expect(response).to.equal(testParams.returnValue);
                expect(getOutputStub.callCount).to.equal(1);
                expect(getLaunchConfigStub.callCount).to.equal(1);
            });
        });
    });

    describe('rollInstances', () => {
        it('should safely roll the instances in the autoscaling group', async () => {
            const getOutputStub = sandbox.stub(awsCalls.cloudFormation, 'getOutput').resolves('FakeGroupName');
            const getAsgStub = sandbox.stub(autoScalingCalls, 'getAutoScalingGroup').resolves({
                DesiredCapacity: 2,
                MaxSize: 3
            });
            const setValuesStub = sandbox.stub(autoScalingCalls, 'setNewDesiredAndMaxValues').resolves();
            const waitStub = sandbox.stub(autoScalingCalls, 'waitForAllInstancesToBeReady').resolves();

            const stack: AWS.CloudFormation.Stack = {
                StackName: 'FakeStack',
                CreationTime: new Date(),
                StackStatus: 'FakeStatus'
            };
            await asgLaunchConfig.rollInstances(serviceContext, stack);
            expect(getOutputStub.callCount).to.equal(1);
            expect(getAsgStub.callCount).to.equal(1);
            expect(setValuesStub.callCount).to.equal(2);
            expect(waitStub.callCount).to.equal(2);
        });
    });
});
