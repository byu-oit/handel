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
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const autoScalingCalls = require('../../lib/aws/auto-scaling-calls');
const sinon = require('sinon');

describe('autoScalingCalls', function () {
  let sandbox;

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
  });

  afterEach(function () {
    sandbox.restore();
    AWS.restore('AutoScaling');
  });

  describe('cycleInstances', function () {
    it('should return null on error', function () {
      AWS.mock('AutoScaling', 'terminateInstanceInAutoScalingGroup', Promise.reject(new Error('someMessage')));
      return autoScalingCalls.cycleInstances({ec2:[{id:'i-instanceId'}]})
      .then(result=>{expect(result).to.be.null});
    });

    it('should return an array of results on success', function () {
      AWS.mock('AutoScaling', 'terminateInstanceInAutoScalingGroup', Promise.resolve({message:'some result'}));
      return autoScalingCalls.cycleInstances({ec2:[{id:'i-instanceId'}]})
      .then(result=>{expect(result).to.be.an('array');});
    });
  });

  describe('describeLaunchConfigurationsByInstanceIds', function () {
    it('should return null on error', function () {
      AWS.mock('AutoScaling', 'describeAutoScalingInstances', Promise.reject(new Error('someMessage')));
      return autoScalingCalls.describeLaunchConfigurationsByInstanceIds([])
      .then(result=>{expect(result).to.be.null});
    });

    it('should return an array of results on success', function () {
      AWS.mock('AutoScaling', 'describeAutoScalingInstances', Promise.resolve({AutoScalingInstances:[]}));
      return autoScalingCalls.describeLaunchConfigurationsByInstanceIds([])
      .then(result=>{expect(result.LaunchConfigurations).to.be.an('array');});
    });
  });
});
