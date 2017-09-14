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
const winston = require('winston');
const s3Calls = require('../../aws/s3-calls');
const route53Calls = require('../../aws/route53-calls');
const DeployContext = require('../../datatypes/deploy-context');
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const s3DeployersCommon = require('../../common/s3-deployers-common');
const handlebarsUtils = require('../../common/handlebars-utils');

const SERVICE_NAME = "S3 Static Site";
const VERSIONING_PARAM_MAPPING = {
    enabled: 'Enabled',
    disabled: 'Suspended'
}

const TTL_UNITS = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
    year: 31536000,
};
const TTL_REGEX = new RegExp(`^(\\d+)(?:(?: )*(${Object.keys(TTL_UNITS).join('|')})(?:s)?)?$`);

function getCompiledS3Template(ownServiceContext, stackName, loggingBucketName) {
    let serviceParams = ownServiceContext.params;

    let bucketName = serviceParams.bucket_name || stackName;
    let versioningStatus = VERSIONING_PARAM_MAPPING[serviceParams.versioning] || 'Suspended';
    let logFilePrefix = s3DeployersCommon.getLogFilePrefix(ownServiceContext);
    let indexDocument = serviceParams.index_document || 'index.html';
    let errorDocument = serviceParams.error_document || 'error.html';

    let dnsName = serviceParams.dns_name;

    let handlebarsParams = {
        bucketName,
        versioningStatus,
        loggingBucketName,
        logFilePrefix,
        indexDocument,
        errorDocument,
        tags: deployPhaseCommon.getTags(ownServiceContext),
        cloudfront: !serviceParams.cloudfront || serviceParams.cloudfront === 'enabled',
        cfMinTTL: computeTTL(serviceParams.cloudfront_min_ttl, 0),
        cfMaxTTL: computeTTL(serviceParams.cloudfront_max_ttl, TTL_UNITS.year),
        cfDefaultTTL: computeTTL(serviceParams.cloudfront_default_ttl, TTL_UNITS.day),
        cfPriceClass: computePriceClass(serviceParams.cloudfront_price_class, 'all'),
        httpsCertificateId: serviceParams.https_certificate,
        dnsName
    };

    let dnsHostedZoneId;
    if (dnsName) {
        dnsHostedZoneId = route53Calls.listHostedZones()
            .then(zones => {
                let zone = route53Calls.getBestMatchingHostedZone(dnsName, zones);
                if (!zone) {
                    throw `No Route53 hosted zone found matching '${dnsName}'`
                }
                return zone.Id;
            });
    } else {
        dnsHostedZoneId = Promise.resolve();
    }

    return dnsHostedZoneId.then(zoneId => {
        handlebarsParams.dnsHostedZoneId = zoneId;
        return handlebarsUtils.compileTemplate(`${__dirname}/s3-static-site-template.yml`, handlebarsParams);
    })
}

function computePriceClass(priceClass, defaultValue) {
    let value = priceClass || defaultValue;
    switch (value) {
        case 100:
        case '100':
            return 'PriceClass_100';
        case 200:
        case '200':
            return 'PriceClass_200';
        case 'all':
            return 'PriceClass_All';
        default:
            throw 'Invalid cloudfront_price_class: ' + value;
    }
}

function isValidTTL(ttl, defaultValue) {
    if (!ttl) {
        return defaultValue;
    }
    return TTL_REGEX.test(ttl);
}

function computeTTL(ttl, defaultValue) {
    if (!ttl) {
        return defaultValue;
    }
    let [, num, unit] = TTL_REGEX.exec(ttl);
    if (!unit) {
        return num;
    }
    let multiplier = TTL_UNITS[unit];
    return multiplier * num;
}


/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext, dependenciesServiceContexts) {
    let errors = [];
    let serviceParams = serviceContext.params;

    if (!serviceParams.path_to_code) {
        errors.push(`${SERVICE_NAME} - The 'path_to_code' parameter is required`);
    }
    let versioning = serviceParams.versioning;
    if (versioning && versioning !== 'enabled' && versioning !== 'disabled') {
        errors.push(`${SERVICE_NAME} - The 'versioning' parameter must be either 'enabled' or 'disabled'`);
    }
    let cloudfront = serviceParams.cloudfront;
    if (cloudfront && cloudfront !== 'enabled' && cloudfront !== 'disabled') {
        errors.push(`${SERVICE_NAME} - The 'cloudfront' parameter must be either 'enabled' or 'disabled'`);
    }

    let cloudfrontDisabled = cloudfront && cloudfront === 'disabled';

    let cfLogging = serviceParams.cloudfront_logging;
    if (cfLogging) {
        if (cloudfrontDisabled) {
            errors.push(`${SERVICE_NAME} - The 'cloudfront_logging' parameter cannot be specified if 'cloudfront' is set to 'disabled'`);
        }
        if (cfLogging !== 'enabled' && cfLogging !== 'disabled') {
            errors.push(`${SERVICE_NAME} - The 'cloudfront_logging' parameter must be either 'enabled' or 'disabled'`);
        }
    }
    let cfPrice = serviceParams.cloudfront_price_class;
    if (cfPrice) {
        if (cloudfrontDisabled) {
            errors.push(`${SERVICE_NAME} - The 'cloudfront_price_class' parameter cannot be specified if 'cloudfront' is set to 'disabled'`);
        }

        let priceString = String(cfPrice);
        if (priceString !== '100' && priceString !== '200' && priceString !== 'all') {
            errors.push(`${SERVICE_NAME} - the 'cloudfront_price_class' parameter must be one of '100', '200', or 'all'`)
        }
    }
    if (serviceParams.https_certificate && cloudfrontDisabled) {
        errors.push(`${SERVICE_NAME} - The 'https_certificate' parameter cannot be specified if 'cloudfront' is set to 'disabled'`);
    }
    let minTTL = serviceParams.cloudfront_min_ttl;
    if (minTTL) {
        if (cloudfrontDisabled) {
            errors.push(`${SERVICE_NAME} - The 'cloudfront_min_ttl' parameter cannot be specified if 'cloudfront' is set to 'disabled'`);
        }
        if (!isValidTTL(minTTL)) {
            errors.push(`${SERVICE_NAME} - The 'cloudfront_min_ttl' parameter must be a valid TTL value`);
        }
    }
    let maxTTL = serviceParams.cloudfront_max_ttl;
    if (maxTTL) {
        if (cloudfrontDisabled) {
            errors.push(`${SERVICE_NAME} - The 'cloudfront_max_ttl' parameter cannot be specified if 'cloudfront' is set to 'disabled'`);
        }
        if (!isValidTTL(maxTTL)) {
            errors.push(`${SERVICE_NAME} - The 'cloudfront_max_ttl' parameter must be a valid TTL value`);
        }
    }
    let defaultTTL = serviceParams.cloudfront_default_ttl;
    if (defaultTTL) {
        if (cloudfrontDisabled) {
            errors.push(`${SERVICE_NAME} - The 'cloudfront_default_ttl' parameter cannot be specified if 'cloudfront' is set to 'disabled'`);
        }
        if (!isValidTTL(defaultTTL)) {
            errors.push(`${SERVICE_NAME} - The 'cloudfront_default_ttl' parameter must be a valid TTL value`);
        }
    }
    if (serviceParams.dns_name) {
        if (cloudfrontDisabled) {
            errors.push(`${SERVICE_NAME} - The 'dns_name' parameter cannot be specified if 'cloudfront' is set to 'disabled'`);
        }
        if (!route53Calls.isValidHostname(serviceParams.dns_name)) {
            errors.push(`${SERVICE_NAME} - The 'dns_name' parameter must be a valid DNS hostname`);
        }
    }

    return errors;
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying static website '${stackName}'`);

    return s3DeployersCommon.createLoggingBucketIfNotExists(ownServiceContext.accountConfig)
        .then(loggingBucketName => {
            return getCompiledS3Template(ownServiceContext, stackName, loggingBucketName)
        })
        .then(compiledTemplate => {
            let stackTags = deployPhaseCommon.getTags(ownServiceContext);
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME, stackTags);
        })
        .then(createdOrUpdatedStack => {
            let bucketName = cloudFormationCalls.getOutput("BucketName", createdOrUpdatedStack);
            //Upload files from path_to_website to S3
            winston.info(`${SERVICE_NAME} - Uploading code files to static site '${stackName}'`);
            return s3Calls.uploadDirectory(bucketName, "", ownServiceContext.params.path_to_code)
                .then(() => {
                    winston.info(`${SERVICE_NAME} - Finished uploading code files to static site '${stackName}'`);
                    return createdOrUpdatedStack;
                });
        })
        .then(createdOrUpdatedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying static site '${stackName}'`);
            return new DeployContext(ownServiceContext);
        });
}

exports.unDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [];

exports.consumedDeployOutputTypes = [];
