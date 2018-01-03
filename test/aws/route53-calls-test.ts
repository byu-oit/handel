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
import { expect } from 'chai';
import * as sinon from 'sinon';
import awsWrapper from '../../src/aws/aws-wrapper';
import * as route53Calls from '../../src/aws/route53-calls';

describe('route53Calls', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('getBestMatchingHostedZone', () => {
        it('should return a hosted zone that matches exactly', () => {
            const zones = [
                {
                    Name: 'exact.test.byu.edu.',
                    Id: 'FakeId1',
                    CallerReference: 'FakeCallerReference'
                }, {
                    Name: 'deeper.exact.test.byu.edu.',
                    Id: 'FakeId2',
                    CallerReference: 'FakeCallerReference'
                }, {
                    Name: 'test.byu.edu.',
                    Id: 'FakeId2',
                    CallerReference: 'FakeCallerReference'
                }
            ];

            const result = route53Calls.getBestMatchingHostedZone('exact.test.byu.edu', zones);
            expect(result).to.not.equal(null);
            expect(result).to.have.property('Name', 'exact.test.byu.edu.');

        });

        it('should return the most-specific parent zone of the specified name', () => {
            const zones = [
                {
                    Name: 'd.c.b.a.',
                    Id: 'FakeId1',
                    CallerReference: 'FakeCallerReference'
                }, {
                    Name: 'c.b.a.',
                    Id: 'FakeId2',
                    CallerReference: 'FakeCallerReference'
                }, {
                    Name: 'b.a.',
                    Id: 'FakeId3',
                    CallerReference: 'FakeCallerReference'
                }
            ];

            const result = route53Calls.getBestMatchingHostedZone('e.d.c.b.a', zones);
            expect(result).to.not.equal(null);
            expect(result).to.have.property('Name', 'd.c.b.a.');
        });

        it('should handle names ending with periods', () => {
            const zones = [
                {
                    Name: 'b.a.',
                    Id: 'FakeId1',
                    CallerReference: 'FakeCallerReference'
                }
            ];

            const result = route53Calls.getBestMatchingHostedZone('b.a.', zones);
            expect(result).to.not.equal(null);
            expect(result).to.have.property('Name', 'b.a.');
        });
    });

    describe('listHostedZones', () => {
        it('should return an array of hosted zones', async () => {
            const listZonesStub = sandbox.stub(awsWrapper.route53, 'listHostedZones');
            listZonesStub.onFirstCall().resolves({
                IsTruncated: false,
                HostedZones: [
                    zone(1), zone(2), zone(3)
                ]
            });

            const zones = await route53Calls.listHostedZones();
            expect(zones).to.not.equal(null);
            expect(zones).to.deep.equal([zone(1), zone(2), zone(3)]);
        });

        it('should handle truncated results', async () => {
            const listZonesStub = sandbox.stub(awsWrapper.route53, 'listHostedZones');

            listZonesStub.onFirstCall().resolves({
                IsTruncated: true,
                Marker: 'marker',
                HostedZones: [
                    zone(1), zone(2)
                ]
            });

            listZonesStub.onSecondCall().resolves({
                IsTruncated: true,
                Marker: 'marker2',
                HostedZones: [
                    zone(3), zone(4)
                ]
            });

            listZonesStub.onThirdCall().resolves({
                IsTruncated: false,
                HostedZones: [
                    zone(5)
                ]
            });

            const zones = await route53Calls.listHostedZones();
            expect(zones).to.not.equal(null);
            expect(zones).to.deep.equal([
                zone(1), zone(2), zone(3), zone(4), zone(5)
            ]);
        });

        function zone(id: number) {
            return {
                Id: `${id}`,
                Name: id + '.example.com.'
            };
        }
    });
});
