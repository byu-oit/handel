const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const unPreDeployPhase = require('../../lib/phases/un-pre-deploy');
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const ServiceContext = require('../../lib/datatypes/service-context');
const UnPreDeployContext = require('../../lib/datatypes/un-pre-deploy-context');
const expect = require('chai').expect;

describe('preDeploy', function() {
    describe('preDeployServices', function() {
        it('should execute predeploy on all services, even across levels', function() {
            let serviceDeployers = {
                efs: {
                    unPreDeploy: function(serviceContext) {
                        return Promise.resolve(new UnPreDeployContext(serviceContext));
                    }
                },
                ecs: {
                    unPreDeploy: function(serviceContext) {
                        return Promise.resolve(new UnPreDeployContext(serviceContext));
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

            return unPreDeployPhase.unPreDeployServices(serviceDeployers, environmentContext)
                .then(unPreDeployContexts => {
                    expect(unPreDeployContexts[serviceNameA]).to.be.instanceof(UnPreDeployContext);
                    expect(unPreDeployContexts[serviceNameB]).to.be.instanceof(UnPreDeployContext);
                });
        });
    });
});