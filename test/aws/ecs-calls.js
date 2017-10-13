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
const ecsCalls = require('../../lib/aws/ecs-calls');
const sinon = require('sinon');

describe('ecsCalls', function () {
  let sandbox;

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
  });

  afterEach(function () {
    sandbox.restore();
    AWS.restore('ECS');
  });

  describe('listInstances', function () {
    it('should return null on error', function () {
      AWS.mock('ECS', 'listContainerInstances', Promise.reject({
        code: "ClusterNotFoundException"
      }));
      AWS.mock('ECS', 'describeContainerInstances', Promise.resolve(
        {
          "containerInstances":
          [
            {
              "containerInstanceArn": "arn:aws:ecs:region:acct:container-instance/instance-serial-number",
              "ec2InstanceId": "i-instance",
              "status": "STATUS",
              "runningTasksCount": 0,
              "pendingTasksCount": 0
            }
          ]
        }
      ));
      return ecsCalls.listInstances('ecs-cluster-name')
        .then(result => {
          expect(result).to.be.null;
        });
    });

    it('should return null when describeinstances returns nothing', function () {
      AWS.mock('ECS', 'listContainerInstances', Promise.resolve(
        {
          "containerInstanceArns":
          [
            "arn:aws:ecs:region:acct:container-instance/instance-serial-number"
          ]
        }
      ));
      AWS.mock('ECS', 'describeContainerInstances', Promise.reject({
        code: "ClusterNotFoundException"
      }));
      return ecsCalls.listInstances('ecs-cluster-name')
        .then(result => {
          expect(result).to.be.null;
        });
    });

    it('should return an object containing an array of ec2 instances on success', function () {
      AWS.mock('ECS', 'listContainerInstances', Promise.resolve(
        {
          "containerInstanceArns":
          [
            "arn:aws:ecs:region:acct:container-instance/instance-serial-number"
          ]
        }
      ));
      AWS.mock('ECS', 'describeContainerInstances', Promise.resolve(
        {
          "containerInstances":
          [
            {
              "containerInstanceArn": "arn:aws:ecs:region:acct:container-instance/instance-serial-number",
              "ec2InstanceId": "i-instance",
              "status": "STATUS",
              "runningTasksCount": 0,
              "pendingTasksCount": 0
            }
          ]
        }
      ));
      return ecsCalls.listInstances('ecs-cluster-name')
        .then(result => { 
          expect(result.ec2[0].id).to.equal('i-instance');
        });
    });
  });
});
