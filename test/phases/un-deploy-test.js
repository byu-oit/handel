const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const unDeployPhase = require('../../lib/phases/un-deploy');
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const ServiceContext = require('../../lib/datatypes/service-context');
const UnDeployContext = require('../../lib/datatypes/un-deploy-context');
const expect = require('chai').expect;
const sinon = require('sinon');

describe('unDeploy', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('unDeployServicesInLevel', function() {
        it('should UnDeploy the services in the given level', function() {
            let serviceDeployers = {
                efs: {
                    unDeploy: function(toUnDeployServiceContext) {
                        throw new Error("Should not have called ECS in this level");
                    }
                },
                ecs: {
                    unDeploy: function(toUnDeployServiceContext) {
                        return Promise.resolve(new UnDeployContext(toUnDeployServiceContext));
                    }
                }
            }

            //Create EnvironmentContext
            let appName = "test";
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
            let levelToUnDeploy = 1;

            return unDeployPhase.unDeployServicesInLevel(serviceDeployers, environmentContext, deployOrder, levelToUnDeploy)
                .then(unDeployContexts => {
                    expect(unDeployContexts[serviceNameA]).to.be.instanceOf(UnDeployContext);
                });
        });
    });
});
