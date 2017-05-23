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
const accountConfig = require('../../lib/common/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const checkPhase = require('../../lib/phases/check');
const EnvironmentContext = require('../../lib/datatypes/environment-context');
const ServiceContext = require('../../lib/datatypes/service-context');
const expect = require('chai').expect;

function getServiceDeployers() {
    return {
        ecs: {
            check: function(serviceContext) {
                return [];
            }
        },
        efs: {
            check: function(serviceContext) {
                return [];
            }
        }
    }
}

function getEnvironmentContext() {
    //Construct EnvironmentContext
    let appName = "FakeApp"
    let deployVersion = "1";
    let environmentName = "dev";
    let environmentContext = new EnvironmentContext(appName, deployVersion, environmentName);

    //Construct ServiceContext A
    let serviceNameA = "A";
    let serviceTypeA = "ecs";
    let paramsA = {
        some: "param"
    }
    let serviceContextA = new ServiceContext(appName, environmentName, serviceNameA, serviceTypeA, deployVersion, paramsA);
    environmentContext.serviceContexts[serviceNameA] = serviceContextA;

    //Construct ServiceContext B
    let serviceNameB = "B";
    let serviceTypeB = "efs"
    let paramsB = {
        other: "param"
    }
    let serviceContextB = new ServiceContext(appName, environmentName, serviceNameB, serviceTypeB, deployVersion, paramsB);
    environmentContext.serviceContexts[serviceNameB] = serviceContextB;
    return environmentContext;
}

describe('check', function() {
    describe('checkServices', function() {
        it('should run check services on all services in the environment', function() {
            let serviceDeployers = getServiceDeployers();
            let environmentContext = getEnvironmentContext();    

            let checkResults = checkPhase.checkServices(serviceDeployers, environmentContext);
            expect(checkResults).to.deep.equal([]);
        });
        
        it('should return errors when there are errors in one or more services', function() {
            let serviceDeployers = getServiceDeployers();
            let ecsErrors = ['ECS Error'];
            serviceDeployers['ecs'].check = function() {
                return ecsErrors
            }
            let efsErrors = ['EFS Errors'];
            serviceDeployers['efs'].check = function() {
                return efsErrors;
            }
            let environmentContext = getEnvironmentContext();    

            let checkResults = checkPhase.checkServices(serviceDeployers, environmentContext);
            expect(checkResults).to.deep.equal(ecsErrors.concat(efsErrors));
        });
    });
});