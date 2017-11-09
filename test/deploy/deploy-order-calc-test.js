/*
 * Copyright 2017 Brigham Young University
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
const deployOrderCalc = require('../../dist/deploy/deploy-order-calc');
const EnvironmentContext = require('../../dist/datatypes/environment-context').EnvironmentContext;
const ServiceContext = require('../../dist/datatypes/service-context').ServiceContext;
const fs = require('fs');
const yaml = require('js-yaml');
const expect = require('chai').expect;

function getEnvironmentContextFromYamlFile(filePath) {
    let doc = yaml.safeLoad(fs.readFileSync(filePath, 'utf8'));

    let environmentContext = new EnvironmentContext(doc.name, "dev", {});
    for(let serviceName in doc.environments.dev) {
        let serviceContext = new ServiceContext(environmentContext.appName, environmentContext.environmentName, serviceName, doc.environments.dev[serviceName].type, doc.environments.dev[serviceName])
        environmentContext.serviceContexts[serviceName] = serviceContext;
    }
    return environmentContext;
}

describe('deploy-order-calc', function() {
    describe('getDeployOrder', function() {
        it('should work with a single service environment', function() {
            let environmentContext = getEnvironmentContextFromYamlFile(`${__dirname}/test-handelfile-single-level-single-service.yml`);
            let deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
            expect(deployOrder).to.deep.equal([
                ['A']
            ]);
        });

        it('should work with a multi-service environment with no dependencies (single level)', function() {
            let environmentContext = getEnvironmentContextFromYamlFile(`${__dirname}/test-handelfile-single-level-multi-service.yml`);
            let deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
            expect(deployOrder).to.deep.equal([
                ['A','B']
            ]);
        });

        it('should work with a multi-service environemnt with dependencies (multi-level)', function() {
            let environmentContext = getEnvironmentContextFromYamlFile(`${__dirname}/test-handelfile-multi-level.yml`);
            let deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
            expect(deployOrder).to.deep.equal([
                ['F','G', 'H'],
                ['C', 'D', 'E'],
                ['A', 'B']
            ]);
        });

        it('should check for circular dependencies', function() {
            let environmentContext = getEnvironmentContextFromYamlFile(`${__dirname}/test-handelfile-circular-dependencies.yml`);
            try {
                let deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
                expect(true).to.be.false; //Should not get here
            }
            catch(e) { }
        });
    })
})