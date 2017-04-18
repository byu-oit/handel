const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const deployPhase = require('../../lib/lifecycle/deploy');
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const ServiceContext = require('../../lib/datatypes/service-context');
const PreDeployContext = require('../../lib/datatypes/pre-deploy-context');
const DeployContext = require('../../lib/datatypes/deploy-context');
const BindContext = require('../../lib/datatypes/bind-context');
const expect = require('chai').expect;
const sinon = require('sinon');
const util = require('../../lib/util/util');

describe('deploy', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('deployServicesInLevel', function() {
        it('should deploy the internal services in the given level', function() {
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

        it('should deploy all services that consume external dependencies', function() {
            let serviceDeployers = {
                efs: {
                    getPreDeployContextForExternalRef: function(externalServiceContext) {
                        return Promise.resolve(new PreDeployContext(externalServiceContext));
                    },
                    getBindContextForExternalRef: function(externalServiceContext, externalPreDeployContext, toDeployServiceContext, toDeployPreDeployContext) {
                        return Promise.resolve(new BindContext(externalServiceContext, toDeployServiceContext));
                    },
                    getDeployContextForExternalRef: function(externalServiceContext) {
                        return Promise.resolve(new DeployContext(externalServiceContext));
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

            //Construct deploying ServiceContext
            let serviceName = "A";
            let serviceType = "ecs";
            let params = {
                some: "param",
                dependencies: [ 
                    "https://fakeurl.github.com/fakeorg/fakerepo/master/handel.yml#appName=fakeApp&envName=fakeEnv&serviceName=fakeService"
                ]
            }
            let serviceContext = new ServiceContext(appName, environmentName, serviceName, serviceType, deployVersion, params);
            environmentContext.serviceContexts[serviceName] = serviceContext;

            //Construct PreDeployContext for own service
            let preDeployContexts = {}
            preDeployContexts[serviceName] = new PreDeployContext(serviceContext);

            //Set deploy order 
            let deployOrder = [
                [serviceName]
            ]
            let levelToDeploy = 0;

             //Stub external calls
            let externalServiceContext = new ServiceContext("FakeExternalApp", "FakeExternalEnv", "FakeExternalService", "efs", "1", {});
            let getExternalServiceContextStub = sandbox.stub(util, 'getExternalServiceContext').returns(Promise.resolve(externalServiceContext));

            return deployPhase.deployServicesInLevel(serviceDeployers, environmentContext, preDeployContexts, {}, deployOrder, levelToDeploy)
                .then(deployContexts => {
                    expect(getExternalServiceContextStub.calledOnce).to.be.true;
                    expect(deployContexts[serviceName]).to.be.instanceOf(DeployContext);
                });
        });
    });
});
