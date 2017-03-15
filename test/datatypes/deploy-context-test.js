const DeployContext = require('../../lib/datatypes/deploy-context');
const expect = require('chai').expect;

describe("DeployContext", function() {
    it('should be able to be constructed from a ServiceContext', function() {
        let serviceContext = {
            appName: 'appName',
            environmentName: 'environmentName',
            serviceName: 'serviceName',
            serviceType: 'serviceType'
        }
        let deployContext = new DeployContext(serviceContext);
        expect(deployContext.appName).to.equal(serviceContext.appName);
        expect(deployContext.environmentName).to.equal(serviceContext.environmentName);
        expect(deployContext.serviceName).to.equal(serviceContext.serviceName);
        expect(deployContext.serviceType).to.equal(serviceContext.serviceType);
        expect(deployContext.policies).to.deep.equal([]);
        expect(deployContext.credentials).to.deep.equal([]);
        expect(deployContext.outputs).to.deep.equal({});
        expect(deployContext.scripts).to.deep.equal([]);
    });
});