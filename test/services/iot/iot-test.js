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
const iot = require('../../../dist/services/iot');
const cloudformationCalls = require('../../../dist/aws/cloudformation-calls');
const ServiceContext = require('../../../dist/datatypes/service-context').ServiceContext;
const DeployContext = require('../../../dist/datatypes/deploy-context').DeployContext;
const UnDeployContext = require('../../../dist/datatypes/un-deploy-context').UnDeployContext;
const ProduceEventsContext = require('../../../dist/datatypes/produce-events-context').ProduceEventsContext;
const deployPhaseCommon = require('../../../dist/common/deploy-phase-common');
const sinon = require('sinon');
const expect = require('chai').expect;

const config = require('../../../dist/account-config/account-config');

describe('iot deployer', function () {
    let sandbox;
    let appName = "FakeApp";
    let envName = "FakeEnv";
    let serviceContext;

    beforeEach(function () {
        return config(`${__dirname}/../../test-account-config.yml`)
            .then(accountConfig => {
                sandbox = sinon.sandbox.create();
                serviceContext = new ServiceContext(appName, envName, "FakeService", "iot", {}, accountConfig);
            });
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('check', function () {
        it('should return an error when the service_name param is not specified in event_consumers', function () {
            serviceContext.params = {
                event_consumers: [{
                    sql: "select * from 'something'"
                }]
            }
            let errors = iot.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'service_name' parameter is required");
        });

        it('should return an error when the sql parameter is not specified in the event_consumers seciton', function () {
            serviceContext.params = {
                event_consumers: [{
                    service_name: 'myconsumer',
                }]
            }
            let errors = iot.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("The 'sql' parameter is required");
        });

        it('should return no errors when configured properly', function () {
            serviceContext.params = {
                event_consumers: [{
                    service_name: 'myconsumer',
                    sql: "select * from 'something'"
                }]
            }
            let errors = iot.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('deploy', function () {
        it('should return an empty deploy context', function () {
            return iot.deploy(serviceContext, {}, {})
                .then(deployContext => {
                    expect(deployContext).to.be.instanceof(DeployContext);
                });
        });
    });

    describe('produceEvents', function () {
        let ownDeployContext;

        beforeEach(function () {
            serviceContext.params = {
                event_consumers: [{
                    service_name: "FakeConsumer",
                    sql: "select * from something;",
                    ruleDisabled: false
                }]
            }

            ownDeployContext = new DeployContext(serviceContext);
        });


        it('should create topic rules when lambda is the event consumer', function () {
            let consumerServiceContext = new ServiceContext(appName, envName, "FakeConsumer", "lambda", {}, {});
            let consumerDeployContext = new DeployContext(consumerServiceContext);
            consumerDeployContext.eventOutputs.lambdaArn = "FakeArn";

            let deployStackStub = sandbox.stub(deployPhaseCommon, 'deployCloudFormationStack').returns(Promise.resolve({
                Outputs: [
                    {
                        OutputKey: 'TopicRuleName',
                        OutputValue: "MyRuleName",
                    }
                ]
            }));

            return iot.produceEvents(serviceContext, ownDeployContext, consumerServiceContext, consumerDeployContext)
                .then(produceEventsContext => {
                    expect(produceEventsContext).to.be.instanceof(ProduceEventsContext);
                    expect(deployStackStub.callCount).to.equal(1);
                });
        });

        it('should return an error if any other consumer type is specified', function () {
            let consumerServiceContext = new ServiceContext(appName, envName, "FakeConsumer", "unknowntype", {}, {});
            let consumerDeployContext = new DeployContext(consumerServiceContext);

            return iot.produceEvents(serviceContext, ownDeployContext, consumerServiceContext, consumerDeployContext)
                .then(produceEventsContext => {
                    expect(true).to.equal(false); //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Unsupported event consumer type")
                })
        })
    });

    describe('unDeploy', function () {
        it('should delete the topic rule stacks', function () {
            serviceContext.params = {
                event_consumers: [
                    {
                        service_name: "A"
                    },
                    {
                        service_name: "B"
                    }
                ]
            }

            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').returns(Promise.resolve({}));

            return iot.unDeploy(serviceContext)
                .then(unDeployContext => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(getStackStub.callCount).to.equal(2);
                    expect(deleteStackStub.callCount).to.equal(2);
                })
        });
    });
});