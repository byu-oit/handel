const EnvironmentContext = require('../../lib/datatypes/environment-context');
const expect = require('chai').expect;

describe('EnvironmentContext', function() {
    it('should be able to be constructed with required parameters', function() {
        let appName = "FakeApp";
        let deployVersion = 1;
        let environmentName = "FakeEnvironment";
        let environmentContext = new EnvironmentContext(appName, deployVersion, environmentName);
        expect(environmentContext.appName).to.equal(appName);
        expect(environmentContext.deployVersion).to.equal(deployVersion);
        expect(environmentContext.environmentName).to.equal(environmentName);
        expect(environmentContext.serviceContexts).to.deep.equal({});
    });
});