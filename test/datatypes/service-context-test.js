const ServiceContext = require('../../lib/datatypes/service-context');
const expect = require('chai').expect;

describe('ServiceContext', function() {
    it('should be able to be constructed from required params', function() {
        let appName = "FakeApp";
        let environmentName = "FakeEnv";
        let serviceName = "FakeService";
        let serviceType = "FakeType";
        let deployVersion = 1;
        let params = {};
        let serviceContext = new ServiceContext(appName, environmentName, serviceName, serviceType, deployVersion, params);
        expect(serviceContext.appName).to.equal(appName);
        expect(serviceContext.environmentName).to.equal(environmentName);
        expect(serviceContext.serviceName).to.equal(serviceName);
        expect(serviceContext.serviceType).to.equal(serviceType);
        expect(serviceContext.deployVersion).to.equal(deployVersion);
        expect(serviceContext.params).to.deep.equal(params);
    });
});