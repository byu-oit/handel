const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const bindPhase = require('../../lib/lifecycle/bind');
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const ServiceContext = require('../../lib/datatypes/service-context');
const PreDeployContext = require('../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../lib/datatypes/bind-context');
const expect = require('chai').expect;
const sinon = require('sinon');
const util = require('../../lib/util/util');

describe('bind', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('bindServicesInLevel', function() {
        it('should execute bind on all the internal services in parallel', function() {
            let serviceDeployers = {
                ecs: {
                    bind: function(toBindServiceContext, toBindPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
                        return Promise.reject(new Error(`Should not have called ECS bind`));
                    }
                },
                efs: {
                    bind: function(toBindServiceContext, toBindPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
                        return Promise.resolve(new BindContext(toBindServiceContext, dependentOfServiceContext));
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

            //Construct ServiceContext C
            let serviceNameC = "C";
            let serviceTypeC = "ecs";
            let paramsC = {
                some: "param",
                dependencies: [ serviceNameB]
            }
            let serviceContextC = new ServiceContext(appName, environmentName, serviceNameC, serviceTypeC, deployVersion, paramsC);
            environmentContext.serviceContexts[serviceNameC] = serviceContextC;
            

            //Construct PreDeployContexts
            let preDeployContexts = {}
            preDeployContexts[serviceNameA] = new PreDeployContext(serviceContextA);
            preDeployContexts[serviceNameB] = new PreDeployContext(serviceContextB);
            preDeployContexts[serviceNameC] = new PreDeployContext(serviceContextC);

            //Set deploy order 
            let deployOrder = [
                [serviceNameB],
                [serviceNameA, serviceNameC]
            ]
            let levelToBind = 0;

            return bindPhase.bindServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployOrder, levelToBind)
                .then(bindContexts => {
                    expect(bindContexts['A->B']).to.be.instanceof(BindContext);
                    expect(bindContexts['C->B']).to.be.instanceof(BindContext);
                });
        });

        it('should execute bind on external services if referenced', function() {
            let serviceDeployers = {
                ecs: {
                    bind: function(toBindServiceContext, toBindPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
                        return Promise.reject(new Error(`Should not have called ECS bind`));
                    }
                },
                efs: {
                    getPreDeployContextForExternalRef: function(externalServiceContext) {
                        return Promise.resolve(new PreDeployContext(externalServiceContext));
                    },
                    bind: function(toBindServiceContext, toBindPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
                        return Promise.resolve(new BindContext(toBindServiceContext, dependentOfServiceContext));
                    }
                }
            }
            
            //Construct EnvironmentContext
            let appName = "FakeApp"
            let deployVersion = "1";
            let environmentName = "dev";
            let environmentContext = new EnvironmentContext(appName, deployVersion, environmentName);

            //Construct ServiceContext
            let serviceName = "A";
            let serviceType = "efs"
            let params = {
                other: "param",
                external_dependent_services: [
                    "https://fakeurl.github.com/fakeorg/fakerepo/master/handel.yml#appName=fakeApp&envName=fakeEnv&serviceName=fakeService"
                ]
            }
            let serviceContext = new ServiceContext(appName, environmentName, serviceName, serviceType, deployVersion, params);
            environmentContext.serviceContexts[serviceName] = serviceContext;
            

            //Construct PreDeployContexts
            let preDeployContexts = {}
            preDeployContexts[serviceName] = new PreDeployContext(serviceContext);

            //Set deploy order 
            let deployOrder = [
                [serviceName]
            ]
            let levelToBind = 0;

            //Stub external calls
            let externalServiceContext = new ServiceContext("FakeExternalApp", "FakeExternalEnv", "FakeExternalService", "efs", "1", {});
            let getExternalServiceContextStub = sandbox.stub(util, 'getExternalServiceContext').returns(Promise.resolve(externalServiceContext));

            return bindPhase.bindServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, deployOrder, levelToBind)
                .then(bindContexts => {
                    expect(getExternalServiceContextStub.calledOnce).to.be.true;
                    expect(bindContexts["https://fakeurl.github.com/fakeorg/fakerepo/master/handel.yml#appName=fakeApp&envName=fakeEnv&serviceName=fakeService->A"]).to.be.instanceof(BindContext);
                });
        });
    });
});