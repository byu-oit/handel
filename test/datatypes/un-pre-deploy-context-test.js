const expect = require('chai').expect;
const ServiceContext = require('../../lib/datatypes/service-context');
const UnPreDeployContext = require('../../lib/datatypes/un-pre-deploy-context');

describe('UnDeployContext', function() {
    it('should be able to be constructed from a ServiceContext', function() {
        let serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', '1', {});
        let unPreDeployContext = new UnPreDeployContext(serviceContext);
        expect(unPreDeployContext.appName).to.equal(serviceContext.appName);
        expect(unPreDeployContext.environmentName).to.equal(serviceContext.environmentName);
        expect(unPreDeployContext.serviceName).to.equal(serviceContext.serviceName);
        expect(unPreDeployContext.serviceType).to.equal(serviceContext.serviceType);
    });
});