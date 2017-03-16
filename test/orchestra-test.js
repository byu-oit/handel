const accountConfig = require('../lib/util/account-config')(`${__dirname}/test-account-config.yml`).getAccountConfig();
const orchestra = require('../lib/orchestra');
const bindLifecycle = require('../lib/lifecycle/bind');
const deployLifecycle = require('../lib/lifecycle/deploy');
const preDeployLifecycle = require('../lib/lifecycle/pre-deploy');
const checkLifecycle = require('../lib/lifecycle/check');
const ServiceContext = require('../lib/datatypes/service-context');
const DeployContext = require('../lib/datatypes/deploy-context');
const PreDeployContext = require('../lib/datatypes/pre-deploy-context');
const BindContext = require('../lib/datatypes/bind-context');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('orchestra module', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('deploy', function() {
        it('should deploy the application environment on success', function() {
            let checkServicesStub = sandbox.stub(checkLifecycle, 'checkServices').returns([]);
            let preDeployServicesStub = sandbox.stub(preDeployLifecycle, 'preDeployServices').returns(Promise.resolve({
                A: new PreDeployContext({}),
                B: new PreDeployContext({})
            }));
            let bindServicesInLevelStub = sandbox.stub(bindLifecycle, 'bindServicesInLevel').returns({});
            let deployServicesInlevelStub = sandbox.stub(deployLifecycle, 'deployServicesInLevel').returns({});

            return orchestra.deploy(`${__dirname}/test-account-config.yml`, `${__dirname}/test-deploy-spec.yml`, "dev", "1")
                .then(results => {
                    expect(checkServicesStub.calledOnce).to.be.true;
                    expect(preDeployServicesStub.calledOnce).to.be.true;
                    expect(bindServicesInLevelStub.calledTwice).to.be.true;
                    expect(deployServicesInlevelStub.calledTwice).to.be.true;
                });
        });

        // it('should fail if there are any check errors', function() {

        // });
    });
});