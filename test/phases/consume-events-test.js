const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const ConsumeEventsContext = require('../../lib/datatypes/consume-events-context');
const DeployContext = require('../../lib/datatypes/deploy-context');
const ServiceContext = require('../../lib/datatypes/service-context');
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const consumeEvents = require('../../lib/phases/consume-events');
const expect = require('chai').expect;
const sinon = require('sinon');
const util = require('../../lib/util/util');

describe('consumeEvents module', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('consumeEvents', function() {
        it('should execute consumeEvents on all services that are specified as consumers by other services', function() {
            let serviceDeployers = {
                lambda: {
                    consumeEvents: function(ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
                        return Promise.resolve(new ConsumeEventsContext(ownServiceContext, producerServiceContext));
                    }
                },
                s3: {
                    consumeEvents: function(ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
                        return Promise.reject(new Error("S3 doesn't consume events"));
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

            return consumeEvents.consumeEvents(serviceDeployers, environmentContext, deployContexts)
                .then(consumeEventsContexts => {
                    expect(consumeEventsContexts['B->A']).to.be.instanceof(ConsumeEventsContext);
                });
        });
    });
});