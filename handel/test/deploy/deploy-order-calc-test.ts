/*
 * Copyright 2018 Brigham Young University
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
import { expect } from 'chai';
import * as fs from 'fs';
import { AccountConfig, ServiceContext, ServiceType } from 'handel-extension-api';
import * as yaml from 'js-yaml';
import 'mocha';
import config from '../../src/account-config/account-config';
import { EnvironmentContext } from '../../src/datatypes';
import * as deployOrderCalc from '../../src/deploy/deploy-order-calc';
import { STDLIB_PREFIX } from '../../src/services/stdlib';

describe('deploy-order-calc', () => {
    let accountConfig: AccountConfig;

    beforeEach(async () => {
         accountConfig = await config(`${__dirname}/../test-account-config.yml`);
    });

    describe('getDeployOrder', () => {
        function getEnvironmentContextFromYamlFile(filePath: string): EnvironmentContext {
            const doc = yaml.safeLoad(fs.readFileSync(filePath, 'utf8')) as any; // These take a few different forms

            const environmentContext = new EnvironmentContext(doc.name, 'dev', accountConfig);
            for (const serviceName in doc.environments.dev) {
                if (doc.environments.dev.hasOwnProperty(serviceName)) {
                    const serviceContext = new ServiceContext(environmentContext.appName, environmentContext.environmentName, serviceName, new ServiceType(STDLIB_PREFIX, doc.environments.dev[serviceName].type), doc.environments.dev[serviceName], accountConfig);
                    environmentContext.serviceContexts[serviceName] = serviceContext;
                }
            }
            return environmentContext;
        }

        it('should work with a single service environment', () => {
            const environmentContext = getEnvironmentContextFromYamlFile(`${__dirname}/test-handelfile-single-level-single-service.yml`);
            const deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
            expect(deployOrder).to.deep.equal([
                ['A']
            ]);
        });

        it('should work with a multi-service environment with no dependencies (single level)', () => {
            const environmentContext = getEnvironmentContextFromYamlFile(`${__dirname}/test-handelfile-single-level-multi-service.yml`);
            const deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
            expect(deployOrder).to.deep.equal([
                ['A', 'B']
            ]);
        });

        it('should work with a multi-service environemnt with dependencies (multi-level)', () => {
            const environmentContext = getEnvironmentContextFromYamlFile(`${__dirname}/test-handelfile-multi-level.yml`);
            const deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
            expect(deployOrder).to.deep.equal([
                ['F', 'G', 'H'],
                ['C', 'D', 'E'],
                ['A', 'B']
            ]);
        });

        it('should check for circular dependencies', () => {
            const environmentContext = getEnvironmentContextFromYamlFile(`${__dirname}/test-handelfile-circular-dependencies.yml`);
            try {
                const deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
                expect(true).to.equal(false); // Should not get here
            }
            catch (err) {
                expect(err.message).to.contain(`application has circular dependencies`);
            }
        });
    });
});
