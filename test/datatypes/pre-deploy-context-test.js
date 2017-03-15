const PreDeployContext = require('../../lib/datatypes/pre-deploy-context');
const expect = require('chai').expect;

describe('PreDeployContext', function() {
    it('should be able to be constructed from a ServiceContext', function() {
        let serviceContext = {
            appName: 'appName',
            environmentName: 'environmentName',
            serviceName: 'serviceName',
            serviceType: 'serviceType'
        };
        let preDeployContext = new PreDeployContext(serviceContext);
        expect(preDeployContext.appName).to.equal(serviceContext.appName);
        expect(preDeployContext.environmentName).to.equal(serviceContext.environmentName);
        expect(preDeployContext.serviceName).to.equal(serviceContext.serviceName);
        expect(preDeployContext.serviceType).to.equal(serviceContext.serviceType);
        expect(preDeployContext.securityGroups).to.deep.equal([]);
    });
});