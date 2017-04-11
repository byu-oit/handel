const expect = require('chai').expect;
const ServiceContext = require('../../lib/datatypes/service-context');
const BindContext = require('../../lib/datatypes/bind-context');

describe('BindContet', function() {
    it('should be able to be constructed from a ServiceContext', function() {
        let dependencyServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'FakeType', '1', {});
        let dependentOfServiceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService2', 'FakeType2', '1', {});
        let bindContext = new BindContext(dependencyServiceContext, dependentOfServiceContext);
        expect(bindContext.dependencyServiceContext.appName).to.equal(dependencyServiceContext.appName);
        expect(bindContext.dependencyServiceContext.environmentName).to.equal(dependencyServiceContext.environmentName);
        expect(bindContext.dependencyServiceContext.serviceName).to.equal(dependencyServiceContext.serviceName);
        expect(bindContext.dependencyServiceContext.serviceType).to.equal(dependencyServiceContext.serviceType);
        expect(bindContext.dependentOfServiceContext.appName).to.equal(dependentOfServiceContext.appName);
        expect(bindContext.dependentOfServiceContext.environmentName).to.equal(dependentOfServiceContext.environmentName);
        expect(bindContext.dependentOfServiceContext.serviceName).to.equal(dependentOfServiceContext.serviceName);
        expect(bindContext.dependentOfServiceContext.serviceType).to.equal(dependentOfServiceContext.serviceType);
    });
})