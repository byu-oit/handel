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
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const route53Calls = require('../../lib/aws/route53-calls');
const sinon = require('sinon');

describe('route53Calls', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
        AWS.restore('Route53');
    });

    describe('getBestMatchingHostedZone', function () {
        it('should return a hosted zone that matches exactly', function () {
            let zones = [
                {
                    Name: 'exact.test.byu.edu.'
                }, {
                    Name: 'deeper.exact.test.byu.edu.'
                }, {
                    Name: 'test.byu.edu.'
                }
            ];

            let result = route53Calls.getBestMatchingHostedZone('exact.test.byu.edu', zones);
            expect(result).to.exist.and.to.not.be.null;
            expect(result).to.have.property('Name', 'exact.test.byu.edu.');

        });

        it('should return the most-specific parent zone of the specified name', function () {
            let zones = [
                {
                    Name: 'd.c.b.a.'
                }, {
                    Name: 'c.b.a.'
                }, {
                    Name: 'b.a.'
                }
            ];

            let result = route53Calls.getBestMatchingHostedZone('e.d.c.b.a', zones);
            expect(result).to.exist.and.to.not.be.null;
            expect(result).to.have.property('Name', 'd.c.b.a.');
        });

        it('should handle names ending with periods', function () {
            let zones = [
                {
                    Name: 'b.a.'
                }
            ];

            let result = route53Calls.getBestMatchingHostedZone('b.a.', zones);
            expect(result).to.exist.and.to.not.be.null;
            expect(result).to.have.property('Name', 'b.a.');
        });
    });

    describe('listHostedZones', function () {
        it('should return an array of hosted zones', function () {
            let listStub = sandbox.stub();
            AWS.mock('Route53', 'listHostedZones', listStub);

            listStub.yields(null, {
                IsTruncated: false,
                HostedZones: [
                    zone(1), zone(2), zone(3)
                ]
            });

            return route53Calls.listHostedZones()
                .then(zones => {
                    expect(zones).to.exist.and.to.not.be.null;
                    expect(zones).to.deep.equal([zone(1), zone(2), zone(3)])
                });
        });

        it('should handle truncated results', function () {
            let listStub = sandbox.stub();
            AWS.mock('Route53', 'listHostedZones', listStub);

            listStub.onFirstCall().yields(null, {
                IsTruncated: true,
                Marker: 'marker',
                HostedZones: [
                    zone(1), zone(2)
                ]
            });

            listStub.onSecondCall().yields(null, {
                IsTruncated: true,
                Marker: 'marker2',
                HostedZones: [
                    zone(3), zone(4)
                ]
            });

            listStub.onThirdCall().yields(null, {
                IsTruncated: false,
                HostedZones: [
                    zone(5)
                ]
            });

            return route53Calls.listHostedZones()
                .then(zones => {
                    expect(zones).to.exist.and.to.not.be.null;
                    expect(zones).to.deep.equal([
                        zone(1), zone(2), zone(3), zone(4), zone(5)
                    ])
                });
        });

        function zone(id) {
            return {
                Id: `${id}`,
                Name: id + '.example.com.'
            };
        }
    });
});