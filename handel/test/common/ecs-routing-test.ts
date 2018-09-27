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
import { Route53 } from 'aws-sdk';
import { expect } from 'chai';
import { AccountConfig, ServiceContext, ServiceType } from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import * as ecsRouting from '../../src/common/ecs-routing';
import { HandlebarsEcsTemplateContainer, LoadBalancerConfigType } from '../../src/common/ecs-shared-config-types';
import { FargateServiceConfig } from '../../src/services/ecs-fargate/config-types';
import { STDLIB_PREFIX } from '../../src/services/stdlib';

describe('ecs routing common module', () => {
    let sandbox: sinon.SinonSandbox;
    let accountConfig: AccountConfig;
    let serviceContext: ServiceContext<FargateServiceConfig>;
    let serviceParams: FargateServiceConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        accountConfig = await config(`${__dirname}/../test-account-config.yml`);
        serviceParams = {
            type: 'ecsfargate',
            containers: [
                {
                    name: 'mycontainername',
                    routing: {
                        base_path: '/mypath',
                        health_check_path: '/healthcheck'
                    }
                }
            ],
            load_balancer: {
                type: LoadBalancerConfigType.HTTPS,
                https_certificate: 'FakeCertId',
                timeout: 60,
                dns_names: [
                    'fake.byu.edu'
                ]
            },
            auto_scaling: {
                min_tasks: 1,
                max_tasks: 1
            }
        };
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType(STDLIB_PREFIX, 'ecsfargate'), serviceParams, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getLoadBalancerConfig', () => {
        it('should return the load balancer configuration from the Handel file', () => {
            const containerConfigs: HandlebarsEcsTemplateContainer[] = [{
                name: 'container',
                maxMb: 256,
                cpuUnits: 1024,
                environmentVariables: {},
                portMappings: [5000],
                imageName: 'fakeImageName',
                routingInfo: {
                    healthCheckPath: '/',
                    basePath: '/',
                    albPriority: 1,
                    containerPort: '5000',
                    targetGroupName: 'FakeTargetGroup'
                }
            }];
            const hostedZones: Route53.HostedZone[] = [{
                Id: 'FakeId',
                Name: 'fake.byu.edu.',
                CallerReference: 'FakeCallerReference'
            }];

            const loadBalancerConfig = ecsRouting.getLoadBalancerConfig(serviceParams, containerConfigs, 'FakeCluster', hostedZones, accountConfig);
            expect(loadBalancerConfig.type).to.equal('https');
            expect(loadBalancerConfig.dnsNames![0].zoneId).to.equal('FakeId');
        });
    });

    describe('checkLoadBalancerSection', () => {
        it('should require an https certificate for the https type', () => {
            delete serviceParams.load_balancer!.https_certificate;
            const errors: string[] = [];
            ecsRouting.checkLoadBalancerSection(serviceContext, errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`The 'https_certificate' parameter is required`);
        });

        it('should require routing if load_balancer is declared', () => {
            delete serviceParams.containers[0].routing;
            const errors: string[] = [];
            ecsRouting.checkLoadBalancerSection(serviceContext, errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`When the 'load_balancer' field is specified, the 'routing' parameter is required`);
        });

        it('should require load_balancer if routing is declared', () => {
            delete serviceParams.load_balancer;
            const errors: string[] = [];
            ecsRouting.checkLoadBalancerSection(serviceContext, errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`When the 'routing' field is specified, the 'load_balancer' parameter is required`);
        });

        it('should require DNS names to be valid hostnames', () => {
            serviceParams.load_balancer!.dns_names[0] = 'invalid$%$$%hostname';
            const errors: string[] = [];
            ecsRouting.checkLoadBalancerSection(serviceContext, errors);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include(`The 'dns_names' values must be valid hostnames`);
        });

        it('should return no errors for a proper configuration', () => {
            const errors: string[] = [];
            ecsRouting.checkLoadBalancerSection(serviceContext, errors);
            expect(errors.length).to.equal(0);
        });
    });
});
