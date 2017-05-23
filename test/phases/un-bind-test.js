const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const unBindPhase = require('../../lib/phases/un-bind');
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const ServiceContext = require('../../lib/datatypes/service-context');
const UnBindContext = require('../../lib/datatypes/un-bind-context');
const expect = require('chai').expect;
const sinon = require('sinon');

describe('unBind', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('unBindServicesInLevel', function() {
        it('should execute UnBind on all the services in parallel', function() {
            let serviceDeployers = {
                ecs: {
                    unBind: function(toUnBindServiceContext) {
                        return Promise.reject(new Error(`Should not have called ECS bind`));
                    }
                },
                efs: {
                    unBind: function(toUnBindServiceContext) {
                        return Promise.resolve(new UnBindContext(toUnBindServiceContext));
                    }
                }
            }
            
            //Construct EnvironmentContext
            let appName = "FakeApp"
            let deployVersion = "1";
            let environmentName = "dev";
            let environmentContext = new EnvironmentContext(appName, deployVersion, environmentName);

            //Construct ServiceContext B
            let serviceNameB = "B";
            let serviceTypeB = "efs"
            let paramsB = {
                other: "param"
            }
            let serviceContextB = new ServiceContext(appName, environmentName, serviceNameB, serviceTypeB, deployVersion, paramsB);
            environmentContext.serviceContexts[serviceNameB] = serviceContextB;

            //Construct ServiceContext A
            let serviceNameA = "A";
            let serviceTypeA = "ecs";
            let paramsA = {
                some: "param",
                dependencies: [ serviceNameB]
            }
            let serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, serviceTypeA, deployVersion, paramsA);
            environmentContext.serviceContexts[serviceNameA] = serviceContextA;
            
            //Set deploy order 
            let deployOrder = [
                [serviceNameB],
                [serviceNameA]
            ]
            let levelToUnBind = 0;

            return unBindPhase.unBindServicesInLevel(serviceDeployers, environmentContext, deployOrder, levelToUnBind)
                .then(unBindContexts => {
                    expect(unBindContexts['B']).to.be.instanceof(UnBindContext);
                });
        });
    });
});