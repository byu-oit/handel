const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const ProduceEventsContext = require('../../lib/datatypes/produce-events-context');
const DeployContext = require('../../lib/datatypes/deploy-context');
const ServiceContext = require('../../lib/datatypes/service-context');
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const ConsumeEventsContext = require('../../lib/datatypes/consume-events-context');
const produceEvents = require('../../lib/lifecycle/produce-events');
const expect = require('chai').expect;
const sinon = require('sinon');
const util = require('../../lib/util/util');

describe('produceEvents module', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('produceEvents', function() {
        it('should execute produceEvents on all services that specify themselves as producers for other services', function() {
            let serviceDeployers = {
                lambda: {
                    produceEvents: function(ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
                        return Promise.reject(new Error("Lambda doesn't produce events"));
                        
                    }
                },
                s3: {
                    produceEvents: function(ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
                        return Promise.resolve(new ProduceEventsContext(ownServiceContext,  consumerServiceContext));
                    }
                }
            };

            //Create EnvironmentContext
            let appName = "test";
            let deployVersion = "1";
            let environmentName = "dev";
            let environmentContext = new EnvironmentContext(appName, deployVersion, environmentName);

            //Construct ServiceContext B (Consuming service)
            let serviceNameB = "B";
            let serviceTypeB = "lambda"
            let paramsB = {
                other: "param"
            }
            let serviceContextB = new ServiceContext(appName, environmentName, serviceNameB, serviceTypeB, deployVersion, paramsB);
            environmentContext.serviceContexts[serviceNameB] = serviceContextB;

            //Construct ServiceContext A (Producing service)
            let serviceNameA = "A";
            let serviceTypeA = "s3";
            let paramsA = {
                some: "param",
                event_consumers: [{
                    service_name: "B"
                }]
            }
            let serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, serviceTypeA, deployVersion, paramsA);
            environmentContext.serviceContexts[serviceNameA] = serviceContextA;

            //Create deployContexts
            let deployContexts = {}
            deployContexts[serviceNameA] = new DeployContext(serviceContextA);
            deployContexts[serviceNameB] = new DeployContext(serviceContextB);

            return produceEvents.produceEvents(serviceDeployers, environmentContext, deployContexts)
                .then(produceEventsContext => {
                    expect(produceEventsContext['A->B']).to.be.instanceof(ProduceEventsContext);
                });
        });

        it('should execute produceEvents for external services', function() {
             let serviceDeployers = {
                lambda: {
                    getDeployContextForExternalRef: function(externalServiceContext) {
                        return Promise.resolve(new DeployContext(externalServiceContext));
                    },
                    getConsumeEventsContextForExternalRef: function(externalServiceContext, externalDeployContext, producerServiceContext, producerDeployContext) {
                        return Promise.resolve(new ConsumeEventsContext(externalServiceContext, producerServiceContext));
                    },
                    produceEvents: function(ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
                        return Promise.reject(new Error("Lambda doesn't produce events"));
                    }
                },
                s3: {
                    produceEvents: function(ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
                        return Promise.resolve(new ProduceEventsContext(ownServiceContext,  consumerServiceContext));
                    }
                }
            };

            //Create EnvironmentContext
            let appName = "test";
            let deployVersion = "1";
            let environmentName = "dev";
            let environmentContext = new EnvironmentContext(appName, deployVersion, environmentName);

            //Construct ServiceContext (Producing service)
            let serviceName = "A";
            let serviceType = "s3"
            let params = {
                event_consumers: [{
                    service_name: "https://fakeurl.github.com/fakeorg/fakerepo/master/handel.yml#appName=fakeApp&envName=fakeEnv&serviceName=fakeService"
                }]
            }
            let serviceContext = new ServiceContext(appName, environmentName, serviceName, serviceType, deployVersion, params);
            environmentContext.serviceContexts[serviceName] = serviceContext;

            //Create deployContexts
            let deployContexts = {};
            deployContexts[serviceName] = new DeployContext(serviceContext);

            //Stub out external calls
            let externalServiceContext = new ServiceContext("FakeExternalApp", "FakeExternalEnv", "FakeExternalService", "lambda", "1", {});
            let getExternalServiceContextStub = sandbox.stub(util, 'getExternalServiceContext').returns(Promise.resolve(externalServiceContext));

            return produceEvents.produceEvents(serviceDeployers, environmentContext, deployContexts)
                .then(produceEventsContext => {
                    expect(getExternalServiceContextStub.calledOnce).to.be.true;
                    expect(produceEventsContext['A->https://fakeurl.github.com/fakeorg/fakerepo/master/handel.yml#appName=fakeApp&envName=fakeEnv&serviceName=fakeService']).to.be.instanceof(ProduceEventsContext);
                });
        });
    });
});