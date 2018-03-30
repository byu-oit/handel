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
import * as autoScalingCalls from '../../src/aws/auto-scaling-calls';
import awsWrapper from '../../src/aws/aws-wrapper';

describe('autoScalingCalls', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('setNewDesiredAndMaxValues', () => {
    it('should set new desired and max values on the ASG', async () => {
      expect(true).to.equal(false); // TODO - TO BE IMPLEMENTED
    });
  });

  describe('waitForAllInstancesToBeReady', () => {
    it('should wait until all desired instances in the group are in a ready state', async () => {
      expect(true).to.equal(false); // TODO - TO BE IMPLEMENTED
    });
  });

  describe('getAutoScalingGroup', () => {
    it('should return the auto scaling group if it exists', async () => {
      expect(true).to.equal(false); // TODO - TO BE IMPLEMENTED
    });

    it('should return null if the group doesnt exist', async () => {
      expect(true).to.equal(false); // TODO - TO BE IMPLEMENTED
    });
  });

  describe('getLaunchConfiguration', () => {
    it('should return the launch configuration if it exists', async () => {
      expect(true).to.equal(false); // TODO - TO BE IMPLEMENTED
    });

    it('should return null if the launch configuration doesnt exist', async () => {
      expect(true).to.equal(false); // TODO - TO BE IMPLEMENTED
    });
  });

  describe('cycleInstances', () => {
    it('should return null on error', async () => {
      const terminateInstanceStub = sandbox.stub(awsWrapper.autoScaling, 'terminateInstanceInAutoScalingGroup').rejects(new Error('someMessage'));

      const result = await autoScalingCalls.cycleInstances([
        { ec2InstanceId: 'i-instanceId' }
      ]);

      expect(terminateInstanceStub.callCount).to.equal(1);
      expect(result).to.equal(null);
    });

    it('should return an array of results on success', async () => {
      const terminateInstanceStub = sandbox.stub(awsWrapper.autoScaling, 'terminateInstanceInAutoScalingGroup').resolves({ message: 'some result' });

      const result = await autoScalingCalls.cycleInstances([
        { ec2InstanceId: 'i-instanceId' }
      ]);

      expect(terminateInstanceStub.callCount).to.equal(1);
      expect(result).to.be.an('array');
    });
  });

  describe('describeLaunchConfigurationsByInstanceIds', () => {
    it('should return null on error', async () => {
      const describeInstancesStub = sandbox.stub(awsWrapper.autoScaling, 'describeAutoScalingInstances').rejects(new Error('someMessage'));

      const result = await autoScalingCalls.describeLaunchConfigurationsByInstanceIds([]);

      expect(describeInstancesStub.callCount).to.equal(1);
      expect(result).to.equal(null);
    });

    it('should return an array of results on success', async () => {
      const describeInstancesStub = sandbox.stub(awsWrapper.autoScaling, 'describeAutoScalingInstances').resolves({ AutoScalingInstances: [] });
      const describeLaunchConfigsStub = sandbox.stub(awsWrapper.autoScaling, 'describeLaunchConfigurations').resolves({ LaunchConfigurations: [] });

      const result = await autoScalingCalls.describeLaunchConfigurationsByInstanceIds([]);

      expect(describeInstancesStub.callCount).to.equal(1);
      expect(describeLaunchConfigsStub.callCount).to.equal(0);
      expect(result!.LaunchConfigurations).to.be.an('array');
    });
  });
});
