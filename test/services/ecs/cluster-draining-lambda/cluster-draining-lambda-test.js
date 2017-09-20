/*
 * Copyright 2017 Brigham Young University
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
const clusterDrainingLambda = require('../../../../lib/services/ecs/cluster-draining-lambda');
const sinon = require('sinon');
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');

describe('ecs cluster draining lambda', function () {
  let sandbox;

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
  });

  afterEach(function () {
    sandbox.restore();
    AWS.restore('ECS');
  });

  describe('handler method', function () {
    let ec2InstanceId='ec2instanceId';
    function mockAwsMethods() {
      let clusterArn = "FakeClusterArn";
      AWS.mock('ECS', 'listClusters', Promise.resolve({
        clusterArns: [
          clusterArn
        ]
      }));
      let containerInstanceArn = "FakeContainerInstanceArn";
      AWS.mock('ECS', 'listContainerInstances', Promise.resolve({
        containerInstanceArns: [
          containerInstanceArn
        ]
      }));
      AWS.mock('ECS', 'describeContainerInstances', Promise.resolve({
        containerInstances: [{
          containerInstanceArn: containerInstanceArn,
          ec2InstanceId: ec2InstanceId
        }]
      }));
      let clusterName = "FakeClusterName";
      AWS.mock('ECS', 'updateContainerInstancesState', Promise.resolve({
        containerInstances: [{
          status: 'DRAINING',
          containerInstanceArn: containerInstanceArn,
          ec2InstanceId: ec2InstanceId
        }]
      }));
    }

    it('should set state of terminating ec2 instance to DRAINING', function () {
      mockAwsMethods();
      return clusterDrainingLambda.handler({detail:{EC2InstanceId:ec2InstanceId}}, {})
      .then(ec2info => {
console.log(ec2info);
          //TODO - Expect something?
      });
    });
  });
});
