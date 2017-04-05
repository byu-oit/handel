const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const ProduceEventsContext = require('../../lib/datatypes/produce-events-context');
const DeployContext = require('../../lib/datatypes/deploy-context');
const ServiceContext = require('../../lib/datatypes/service-context');
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const produceEvents = require('../../lib/lifecycle/produce-events');
const expect = require('chai').expect;

describe('produceEvents module', function() {
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
                    type: "lambda",
                    consuming_service: "B"
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
    });
});