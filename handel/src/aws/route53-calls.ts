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
import * as AWS from 'aws-sdk';
import awsWrapper from './aws-wrapper';

export function listHostedZones(): Promise<AWS.Route53.HostedZone[]> {
    return makeCall(undefined, []);

    async function makeCall(marker: string | undefined, previousResult: AWS.Route53.HostedZone[]): Promise<AWS.Route53.HostedZone[]> {
        const listParams: AWS.Route53.ListHostedZonesRequest = {
            Marker: marker,
            MaxItems: '100'
        };
        const listResponse = await awsWrapper.route53.listHostedZones(listParams);
        const result = previousResult.concat(listResponse.HostedZones);
        if (listResponse.IsTruncated) {
            return makeCall(listResponse.Marker, result);
        } else {
            return result;
        }
    }
}

export function getBestMatchingHostedZone(domain: string, zones: AWS.Route53.HostedZone[]): AWS.Route53.HostedZone | undefined {
    // DNS zone names end with '.'
    const zoneName = domain.endsWith('.') ? domain : domain + '.';
    return zones.filter(it => zoneName.endsWith(it.Name))
        .sort((left, right) => left.Name.length - right.Name.length)
        .pop();
}

const VALID_HOSTNAME_REGEX = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/;

export function isValidHostname(hostname: string): boolean {
    return !!hostname.match(VALID_HOSTNAME_REGEX);
}
