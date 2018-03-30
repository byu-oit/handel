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
import 'mocha';
import * as sinon from 'sinon';
import config from '../../../src/account-config/account-config';
import * as route53Calls from '../../../src/aws/route53-calls';
import { AccountConfig, ServiceContext } from '../../../src/datatypes';
import * as alb from '../../../src/services/codedeploy/alb';
import { CodeDeployServiceConfig } from '../../../src/services/codedeploy/config-types';

describe('codedeploy alb config module', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<CodeDeployServiceConfig>;
    let serviceParams: CodeDeployServiceConfig;
    let accountConfig: AccountConfig;

    beforeEach(async () => {
        accountConfig = await config(`${__dirname}/../../test-account-config.yml`);
        serviceParams = {
            type: 'codedeploy',
            path_to_code: '.',
            os: 'linux',
            routing: {
                type: 'https',
                https_certificate: 'fakecertificateid',
                base_path: '/mybasepath',
                health_check_path: '/healthcheck',
                dns_names: [
                    'mydnsname.myfakedomain.com'
                ]
            }
        };
        serviceContext = new ServiceContext('FakeApp', 'FakeEnv', 'FakeService', 'codedeploy', serviceParams, accountConfig);
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getRoutingConfig', () => {
        let listHostedZonesStub: sinon.SinonStub;
        let getBestZoneStub: sinon.SinonStub;

        beforeEach(() => {
            listHostedZonesStub = sandbox.stub(route53Calls, 'listHostedZones').resolves([{
                Id: 'FakeZoneId'
            }]);
            getBestZoneStub = sandbox.stub(route53Calls, 'getBestMatchingHostedZone').returns({
                Id: 'FakeZoneId'
            });
        });

        it('should return the routing config ', async () => {
            const routingConfig = await alb.getRoutingConfig('FakeStackname-That-Is-Really-Lo-ng-With-Dashes', serviceContext);
            expect(routingConfig).to.deep.equal({
                albName: 'FakeStackname-That-Is-Really-Lo',
                basePath: '/mybasepath',
                healthCheckPath: '/healthcheck',
                httpsCertificate: 'arn:aws:acm:us-west-2:123456789012:certificate/fakecertificateid',
                dnsNames: [{
                    name: 'mydnsname.myfakedomain.com',
                    zoneId: 'FakeZoneId'
                }]
            });
            expect(listHostedZonesStub.callCount).to.equal(1);
            expect(getBestZoneStub.callCount).to.equal(1);
        });

        it('should return undefined if there is no routing config in the service params', async () => {
            delete serviceContext.params.routing;
            const routingConfig = await alb.getRoutingConfig('FakeStackName', serviceContext);
            expect(routingConfig).to.equal(undefined);
            expect(listHostedZonesStub.callCount).to.equal(0);
            expect(getBestZoneStub.callCount).to.equal(0);
        });
    });
});
