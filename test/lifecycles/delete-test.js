const accountConfig = require('../../lib/util/account-config')(`${__dirname}/test-account-config.yml`).getAccountConfig();
const deleteLifecycle = require('../../lib/lifecycles/delete');
const unDeployPhase = require('../../lib/phases/un-deploy');
const unPreDeployPhase = require('../../lib/phases/un-pre-deploy');
const unBindPhase = require('../../lib/phases/un-bind');
const UnPreDeployContext = require('../../lib/datatypes/un-pre-deploy-context');
const util = require('../../lib/util/util');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('delete lifecycle module', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('delete', function() {
        it('should delete the application environment', function() {
            let unDeployServicesStub = sandbox.stub(unDeployPhase, 'unDeployServicesInLevel').returns({});
            let unBindServicesStub = sandbox.stub(unBindPhase, 'unBindServicesInLevel').returns({});
            let unPreDeployStub = sandbox.stub(unPreDeployPhase, 'unPreDeployServices').returns(Promise.resolve({
                A: new UnPreDeployContext({})
            }));
            let handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
            return deleteLifecycle.delete(`${__dirname}/../test-account-config.yml`, handelFile, "dev")
                .then(results => {
                    expect(unPreDeployStub.callCount).to.equal(1);
                    expect(unBindServicesStub.callCount).to.equal(2);
                    expect(unDeployServicesStub.callCount).to.equal(2);
                });
        });
    });
});