const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const deployPhase = require('../../lib/phases/deploy');
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const ServiceContext = require('../../lib/datatypes/service-context');
const PreDeployContext = require('../../lib/datatypes/pre-deploy-context');
const DeployContext = require('../../lib/datatypes/deploy-context');
const expect = require('chai').expect;
const sinon = require('sinon');

describe('deploy', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('deployServicesInLevel', function() {
        it('should deploy the services in the given level', function() {
            let serviceDeployers = {
                efs: {
                    deploy: function(toDeployServiceContext, toDeployPreDeployContext, dependenciesDeployContexts) {
                        throw new Error("Should not have called ECS in this level");
                    }
                },
                ecs: {
                    deploy: function(toDeployServiceContext, toDeployPreDeployContext, dependenciesDeployContexts) {
                        return Promise.resolve(new DeployContext(toDeployServiceContext));
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

            //Construct PreDeployContexts
            let preDeployContexts = {}
            preDeployContexts[serviceNameA] = new PreDeployContext(serviceContextA);
            preDeployContexts[serviceNameB] = new PreDeployContext(serviceContextB);

            //Construct DeployContexts 
            let deployContexts = {}
            deployContexts[serviceNameB] = new DeployContext(serviceContextB);

            //Set deploy order 
            let deployOrder = [
                [serviceNameB],
                [serviceNameA]
            ]
            let levelToDeploy = 1;

            return deployPhase.deployServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployContexts, deployOrder, levelToDeploy)
                .then(deployContexts => {
                    expect(deployContexts[serviceNameA]).to.be.instanceOf(DeployContext);
                });
        });
    });
});
