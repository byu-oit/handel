const accountConfig = require('../../lib/util/account-config')(`${__dirname}/test-account-config.yml`).getAccountConfig();
const checkLifecycle = require('../../lib/lifecycles/check');
const checkPhase = require('../../lib/phases/check');
const util = require('../../lib/util/util');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('check lifecycle module', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('check', function() {
        it('should check the Handel file for errors', function() {
            let error = 'SomeService - Some error was found'
            let checkServicesStub = sandbox.stub(checkPhase, 'checkServices').returns([error])

            let handelFile = util.readYamlFileSync(`${__dirname}/../test-handel.yml`);
            handelFile.environments.dev.B.database_name = null; //Cause error
            let errors = checkLifecycle.check(handelFile);
            expect(checkServicesStub.calledTwice).to.be.true;
            expect(errors.dev.length).to.equal(1);
            expect(errors.dev[0]).to.equal(error);
        });
    });
});