const expect = require('chai').expect;
const BindContext = require('../../lib/datatypes/bind-context');

describe('BindContet', function() {
    it('should be able to be constructed from a ServiceContext', function() {
        let serviceContext = {
            appName: 'appName',
            environmentName: 'environmentName',
            serviceName: 'serviceName',
            serviceType: 'serviceType'
        }
        let bindContext = new BindContext(serviceContext);
        expect(bindContext.appName).to.equal(serviceContext.appName);
        expect(bindContext.environmentName).to.equal(serviceContext.environmentName);
        expect(bindContext.serviceName).to.equal(serviceContext.serviceName);
        expect(bindContext.serviceType).to.equal(serviceContext.serviceType);
    });
})