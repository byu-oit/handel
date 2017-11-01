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
const AWS = require('aws-sdk');
const winston = require('winston');

exports.listHostedZones = function () {
    let Route53 = new AWS.Route53();

    return makeCall(null, []);

    function makeCall(marker, previousResult) {
        return Route53.listHostedZones({
            Marker: marker,
            MaxItems: '100'
        }).promise().then(data => {
            let result = previousResult.concat(data.HostedZones);
            if (data.IsTruncated) {
                return makeCall(data.Marker, result)
            } else {
                return result;
            }
        });
    }
};

exports.getBestMatchingHostedZone = function (domain, zones) {
    //DNS zone names end with '.'
    let zoneName = domain.endsWith('.') ? domain : domain + '.';
    return zones.filter(it => zoneName.endsWith(it.Name))
        .sort((left, right) => left.Name.length - right.Name.length)
        .pop();
};

const VALID_HOSTNAME_REGEX = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/;

exports.isValidHostname = function(string) {
   return !!string.match(VALID_HOSTNAME_REGEX);
};
