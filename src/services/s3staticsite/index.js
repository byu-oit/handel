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
const DeployContext = require('../../datatypes/deploy-context').DeployContext;
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const s3DeployersCommon = require('../../common/s3-deployers-common');
const handlebarsUtils = require('../../common/handlebars-utils');
const fs = require('fs-extra');

const SERVICE_NAME = "S3 Static Site";
const VERSIONING_PARAM_MAPPING = {
    enabled: 'Enabled',
    disabled: 'Suspended'
};

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

        let handlebarsParams = {
            bucketName,
            versioningStatus,
            loggingBucketName,
            logFilePrefix,
            indexDocument,
            errorDocument,
            tags: deployPhaseCommon.getTags(ownServiceContext),

        };

        return getCloudfrontTemplateParameters(ownServiceContext).then(cfParameters => {
            handlebarsParams.cloudfront = cfParameters;
            return handlebarsUtils.compileTemplate(`${__dirname}/s3-static-site-template.yml`, handlebarsParams);
        });
}

function getCloudfrontTemplateParameters(ownServiceContext) {
    let cf = ownServiceContext.params.cloudfront;
    if (!cf) {
        return Promise.resolve(null);
    }

    let getIpv6Function = fs.readFile(`${__dirname}/set-ipv6.js`, 'utf-8').then(code => JSON.stringify(code));
    let getHostedZones = route53Calls.listHostedZones();

    return Promise.all([getIpv6Function, getHostedZones]).then(results => {
        let [ipV6FunctionBody, hostedZones] = results;
        let handlebarsParams = {
            logging: !cf.logging || cf.logging === 'enabled',
            minTTL: computeTTL(cf.min_ttl, 0),
            maxTTL: computeTTL(cf.max_ttl, TTL_UNITS.year),
            defaultTTL: computeTTL(cf.default_ttl, TTL_UNITS.day),
            priceClass: computePriceClass(cf.price_class, 'all'),
            httpsCertificateId: cf.https_certificate,
            setIPV6FunctionBody: ipV6FunctionBody
        };

        let dnsNames = cf.dns_names;
        if (dnsNames) {
            handlebarsParams.dnsNames = dnsNames.map(dnsName => {
                let zone = route53Calls.getBestMatchingHostedZone(dnsName, hostedZones);
                if (!zone) {
                    throw `No Route53 hosted zone found matching '${dnsName}'`;
                }
                return {
                    name: dnsName,
                    zoneId: zone.Id
                }
            });
        }
        return handlebarsParams;
    });
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

function isValidTTL(ttl) {
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

function checkCloudfront(cloudfront) {
    let errors = [];

    let logging = cloudfront.logging;
    if (logging && logging !== 'enabled' && logging !== 'disabled') {
        errors.push(`${SERVICE_NAME} - 'cloudfront' -  The 'logging' parameter must be either 'enabled' or 'disabled'`);
    }
    let priceClass = cloudfront.price_class;
    if (priceClass) {
        let priceString = String(priceClass);
        if (priceString !== '100' && priceString !== '200' && priceString !== 'all') {
            errors.push(`${SERVICE_NAME} - 'cloudfront' - the 'price_class' parameter must be one of '100', '200', or 'all'`);
        }
    }
    if (cloudfront.min_ttl && !isValidTTL(cloudfront.min_ttl)) {
        errors.push(`${SERVICE_NAME} - 'cloudfront' - The 'min_ttl' parameter must be a valid TTL value`);
    }
    if (cloudfront.max_ttl && !isValidTTL(cloudfront.max_ttl)) {
        errors.push(`${SERVICE_NAME} - 'cloudfront' - The 'max_ttl' parameter must be a valid TTL value`);
    }
    if (cloudfront.default_ttl && !isValidTTL(cloudfront.default_ttl)) {
        errors.push(`${SERVICE_NAME} - 'cloudfront' - The 'default_ttl' parameter must be a valid TTL value`);
    }

    if (cloudfront.dns_names) {
        let badName = cloudfront.dns_names.some(name => !route53Calls.isValidHostname(name));

        if (badName) {
            errors.push(`${SERVICE_NAME} - 'cloudfront' - The 'dns_name' parameter must be a valid DNS hostname`);
        }
    }

    return errors;
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

    if (serviceParams.cloudfront) {
        let cfErrors = checkCloudfront(serviceParams.cloudfront);
        errors.push(...cfErrors);
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
