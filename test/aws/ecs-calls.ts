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
import * as sinon from 'sinon';
import awsWrapper from '../../src/aws/aws-wrapper';
import * as ecsCalls from '../../src/aws/ecs-calls';

describe('ecsCalls', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('listInstances', () => {
    it('should return an empty list on error', async () => {
      const listInstancesStub = sandbox.stub(awsWrapper.ecs, 'listContainerInstances').rejects({
        code: 'ClusterNotFoundException'
      });
      const result = await ecsCalls.listInstances('ecs-cluster-name');
      expect(listInstancesStub.callCount).to.equal(1);
      expect(result).to.deep.equal([]);
    });

    it('should return an empty list when describeinstances returns nothing', async () => {
      const listInstancesStub = sandbox.stub(awsWrapper.ecs, 'listContainerInstances').resolves({
        'containerInstanceArns': [
          'arn:aws:ecs:region:acct:container-instance/instance-serial-number'
        ]
      });
      const describeInstanceStub = sandbox.stub(awsWrapper.ecs, 'describeContainerInstances').rejects({
        code: 'ClusterNotFoundException'
      });
      const result = await ecsCalls.listInstances('ecs-cluster-name');
      expect(listInstancesStub.callCount).to.equal(1);
      expect(describeInstanceStub.callCount).to.equal(1);
      expect(result).to.deep.equal([]);
    });

    it('should return an object containing an array of ec2 instances on success', async () => {
      const listInstancesStub = sandbox.stub(awsWrapper.ecs, 'listContainerInstances').resolves({
        'containerInstanceArns': [
          'arn:aws:ecs:region:acct:container-instance/instance-serial-number'
        ]
      });
      const describeInstanceStub = sandbox.stub(awsWrapper.ecs, 'describeContainerInstances').resolves({
        'containerInstances': [
          {
            'containerInstanceArn': 'arn:aws:ecs:region:acct:container-instance/instance-serial-number',
            'ec2InstanceId': 'i-instance',
            'status': 'STATUS',
            'runningTasksCount': 0,
            'pendingTasksCount': 0
          }
        ]
      });

      const result = await ecsCalls.listInstances('ecs-cluster-name');
      expect(listInstancesStub.callCount).to.equal(1);
      expect(describeInstanceStub.callCount).to.equal(1);
      expect(result[0].ec2InstanceId).to.equal('i-instance');
    });
  });
});
