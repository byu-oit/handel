const expect = require('chai').expect;
const ServiceContext = require('../../lib/datatypes/service-context');
const UnDeployContext = require('../../lib/datatypes/un-deploy-context');

describe('UnDeployContext', function() {
    it('should be able to be constructed from a ServiceContext', function() {
        let serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', '1', {});
        let unDeployContext = new UnDeployContext(serviceContext);
        expect(unDeployContext.appName).to.equal(serviceContext.appName);
        expect(unDeployContext.environmentName).to.equal(serviceContext.environmentName);
        expect(unDeployContext.serviceName).to.equal(serviceContext.serviceName);
        expect(unDeployContext.serviceType).to.equal(serviceContext.serviceType);
    });
});