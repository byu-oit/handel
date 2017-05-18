const accountConfig = require('../lib/util/account-config')(`${__dirname}/test-account-config.yml`).getAccountConfig();
const handel = require('../lib/handel');
const bindLifecycle = require('../lib/lifecycle/bind');
const deployLifecycle = require('../lib/lifecycle/deploy');
const preDeployLifecycle = require('../lib/lifecycle/pre-deploy');
const checkLifecycle = require('../lib/lifecycle/check');
const unDeployLifecycle = require('../lib/lifecycle/un-deploy');
const unPreDeployLifecycle = require('../lib/lifecycle/un-pre-deploy');
const unBindLifecycle = require('../lib/lifecycle/un-bind');
const PreDeployContext = require('../lib/datatypes/pre-deploy-context');
const UnPreDeployContext = require('../lib/datatypes/un-pre-deploy-context');
const util = require('../lib/util/util');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('handel module', function() {
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
            let handelFile = util.readYamlFileSync(`${__dirname}/test-handel.yml`);
            return handel.deploy(`${__dirname}/test-account-config.yml`, handelFile, ["dev", "prod"], "1")
                .then(results => {
                    expect(checkServicesStub.calledTwice).to.be.true;
                    expect(preDeployServicesStub.calledTwice).to.be.true;
                    expect(bindServicesInLevelStub.callCount).to.equal(4);
                    expect(deployServicesInlevelStub.callCount).to.equal(4);
                });
        });
    });

    describe('delete', function() {
        it('should delete the application environment', function() {
            let unDeployServicesStub = sandbox.stub(unDeployLifecycle, 'unDeployServicesInLevel').returns({});
            let unBindServicesStub = sandbox.stub(unBindLifecycle, 'unBindServicesInLevel').returns({});
            let unPreDeployStub = sandbox.stub(unPreDeployLifecycle, 'unPreDeployServices').returns(Promise.resolve({
                A: new UnPreDeployContext({})
            }));
            let handelFile = util.readYamlFileSync(`${__dirname}/test-handel.yml`);
            return handel.delete(`${__dirname}/test-account-config.yml`, handelFile, "dev")
                .then(results => {
                    expect(unPreDeployStub.callCount).to.equal(1);
                    expect(unBindServicesStub.callCount).to.equal(2);
                    expect(unDeployServicesStub.callCount).to.equal(2);
                });
        });
    });
});