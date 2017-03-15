const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const deployOrderCalc = require('../../lib/deploy/deploy-order-calc');
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const ServiceContext = require('../../lib/datatypes/service-context');
const fs = require('fs');
const yaml = require('js-yaml');
const expect = require('chai').expect;

function getEnvironmentContextFromYamlFile(filePath) {
    let doc = yaml.safeLoad(fs.readFileSync(filePath, 'utf8'));

    let environmentContext = new EnvironmentContext(doc.name, 1, "dev");
    for(let serviceName in doc.environments.dev) {
        let serviceContext = new ServiceContext(environmentContext.appName, environmentContext.environmentName, serviceName, doc.environments.dev[serviceName].type, 1, doc.environments.dev[serviceName])
        environmentContext.serviceContexts[serviceName] = serviceContext;
    }
    return environmentContext;
}

describe('deploy-order-calc', function() {
    describe('getDeployOrder', function() {
        it('should work with a single service environment', function() {
            let environmentContext = getEnvironmentContextFromYamlFile(`${__dirname}/test-deployspec-single-level-single-service.yml`);
            let deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
            expect(deployOrder).to.deep.equal([
                ['A']
            ]);
        });

        it('should work with a multi-service environment with no dependencies (single level)', function() {
            let environmentContext = getEnvironmentContextFromYamlFile(`${__dirname}/test-deployspec-single-level-multi-service.yml`);
            let deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
            expect(deployOrder).to.deep.equal([
                ['A','B']
            ]);
        });

        it('should work with a multi-service environemnt with dependencies (multi-level)', function() {
            let environmentContext = getEnvironmentContextFromYamlFile(`${__dirname}/test-deployspec-multi-level.yml`);
            let deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
            expect(deployOrder).to.deep.equal([
                ['F','G', 'H'],
                ['C', 'D', 'E'],
                ['A', 'B']
            ]);
        });

        it('should check for circular dependencies', function() {
            let environmentContext = getEnvironmentContextFromYamlFile(`${__dirname}/test-deployspec-circular-dependencies.yml`);
            try {
                let deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
                expect(true).to.be.false; //Should not get here
            }
            catch(e) { }
        });
    })
})