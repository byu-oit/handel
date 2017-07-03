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
const clusterScalingLambda = require('../../../../lib/services/ecs/cluster-scaling-lambda');
const sinon = require('sinon');
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');

describe('ecs cluster scaling lambda', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
        AWS.restore('ECS');
        AWS.restore('CloudWatch');
    });

    describe('handler method', function () {
        function mockAwsMethods() {
                        let clusterArn = "FakeClusterArn";
            AWS.mock('ECS', 'listClusters', Promise.resolve({
                clusterArns: [
                    clusterArn
                ]
            }));
            let clusterName = "FakeClusterName";
            AWS.mock('ECS', 'describeClusters', Promise.resolve({
                clusters: [{
                    clusterName
                }]
            }));
            let containerInstanceArn = "FakeContainerInstanceArn";
            AWS.mock('ECS', 'listContainerInstances', Promise.resolve({
                containerInstanceArns: [
                    containerInstanceArn
                ]
            }));
            AWS.mock('ECS', 'describeContainerInstances', Promise.resolve({
                containerInstances: [{
                    remainingResources: [
                        {
                            name: 'CPU',
                            integerValue: '100'
                        },
                        {
                            name: "MEMORY",
                            integerValue: '128',
                        }
                    ],
                    registeredResources: [
                        {
                            name: 'CPU',
                            integerValue: '100'
                        },
                        {
                            name: "MEMORY",
                            integerValue: '128',
                        }
                    ]
                }]
            }));
            let taskArn = "FakeTaskArn";
            AWS.mock('ECS', 'listTasks', Promise.resolve({
                taskArns: [
                    taskArn
                ]
            }));
            let taskDefinitionArn = "FakeTaskDefinitionArn";
            AWS.mock('ECS', 'describeTasks', Promise.resolve({
                tasks: [{
                    taskDefinitionArn
                }]
            }));
            AWS.mock('ECS', 'describeTaskDefinition', Promise.resolve({
                taskDefinition: {
                    containerDefinitions: [{
                        cpu: '100',
                        memory: '128'
                    }]
                }
            }));
            AWS.mock('CloudWatch', 'putMetricData', Promise.resolve({}));
        }

        it('should notify CloudWatch to scale up when there is no more room on the cluster', function () {
            mockAwsMethods();
            return clusterScalingLambda.handler({}, {})
                .then(updateMetrics => {
                    //TODO - Expect something?
                });
        });

        it('should notify CloudWatch to scale down when the number of scehdulable containers is greater than what fits on the largest instance', function () {

        });

        it('should notify CloudWatch to do nothing if neither of the above cases apply', function () {

        });
    });
});