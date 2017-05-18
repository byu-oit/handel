const expect = require('chai').expect;
const ServiceContext = require('../../lib/datatypes/service-context');
const UnBindContext = require('../../lib/datatypes/un-bind-context');

describe('UnBindContext', function() {
    it('should be able to be constructed from a ServiceContext', function() {
        let serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', '1', {});
        let unBindContext = new UnBindContext(serviceContext);
        expect(unBindContext.appName).to.equal(serviceContext.appName);
        expect(unBindContext.environmentName).to.equal(serviceContext.environmentName);
        expect(unBindContext.serviceName).to.equal(serviceContext.serviceName);
        expect(unBindContext.serviceType).to.equal(serviceContext.serviceType);
    });
});