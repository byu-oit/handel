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
import {DeployContext, PreDeployContext, ServiceConfig, ServiceContext, UnDeployContext} from 'handel-extension-api';
import { awsCalls, deletePhases, deployPhase, handlebars, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import * as route53Calls from '../../aws/route53-calls';
import * as s3Calls from '../../aws/s3-calls';
import * as s3DeployersCommon from '../../common/s3-deployers-common';
import {
    CloudFrontConfig,
    HandlebarsCloudFrontParams,
    HandlebarsS3StaticSiteTemplate,
    S3StaticSiteServiceConfig
} from './config-types';

const SERVICE_NAME = 'S3 Static Site';

interface VersioningParamMapping {
    [key: string]: string;
}

const VERSIONING_PARAM_MAPPING: VersioningParamMapping = {
    enabled: 'Enabled',
    disabled: 'Suspended'
};

interface TtlUnits {
    [key: string]: number;
}

const TTL_UNITS: TtlUnits = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
    year: 31536000,
};
const TTL_REGEX = new RegExp(`^(\\d+)(?:(?: )*(${Object.keys(TTL_UNITS).join('|')})(?:s)?)?$`);

async function getCompiledS3Template(ownServiceContext: ServiceContext<S3StaticSiteServiceConfig>, stackName: string, loggingBucketName: string): Promise<string> {
    const serviceParams = ownServiceContext.params;

    const bucketName = serviceParams.bucket_name || stackName;
    const versioningStatus = VERSIONING_PARAM_MAPPING[serviceParams.versioning!] || 'Suspended';
    const logFilePrefix = s3DeployersCommon.getLogFilePrefix(ownServiceContext);
    const indexDocument = serviceParams.index_document || 'index.html';
    const errorDocument = serviceParams.error_document || 'error.html';

    const handlebarsParams: HandlebarsS3StaticSiteTemplate = {
        bucketName,
        versioningStatus,
        loggingBucketName,
        logFilePrefix,
        indexDocument,
        errorDocument,
        tags: tagging.getTags(ownServiceContext),

    };

    handlebarsParams.cloudfront = await getCloudfrontTemplateParameters(ownServiceContext);
    return handlebars.compileTemplate(`${__dirname}/s3-static-site-template.yml`, handlebarsParams);
}

async function getCloudfrontTemplateParameters(ownServiceContext: ServiceContext<S3StaticSiteServiceConfig>): Promise<HandlebarsCloudFrontParams | undefined> {
    const cf = ownServiceContext.params.cloudfront;
    if (!cf) {
        return Promise.resolve(undefined);
    }

    const hostedZones = await route53Calls.listHostedZones();

    const handlebarsParams: HandlebarsCloudFrontParams = {
        logging: !cf.logging || cf.logging === 'enabled',
        minTTL: computeTTL(cf.min_ttl, 0),
        maxTTL: computeTTL(cf.max_ttl, TTL_UNITS.year),
        defaultTTL: computeTTL(cf.default_ttl, TTL_UNITS.day),
        priceClass: computePriceClass(cf.price_class, 'all'),
        httpsCertificateId: cf.https_certificate,
    };

    const dnsNames = cf.dns_names;
    if (dnsNames) {
        handlebarsParams.dnsNames = dnsNames.map(dnsName => {
            const zone = route53Calls.getBestMatchingHostedZone(dnsName, hostedZones);
            if (!zone) {
                throw new Error(`There is no Route53 hosted zone in this account that matches '${dnsName}'`);
            }
            return {
                name: dnsName,
                zoneId: zone.Id
            };
        });
    }
    return handlebarsParams;
}

function computePriceClass(priceClass: number | string | undefined, defaultValue: number | string): string {
    const value = priceClass || defaultValue;
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
            throw new Error(`Invalid cloudfront_price_class: ${value}`);
    }
}

function isValidTTL(ttl: string): boolean {
    return TTL_REGEX.test(ttl);
}

function computeTTL(ttl: string | undefined, defaultValue: number): number {
    if (!ttl) {
        return defaultValue;
    }

    const [, num, unit] = TTL_REGEX.exec(ttl)!;
    if (!unit) {
        return parseInt(num, 10);
    }
    const multiplier = TTL_UNITS[unit];
    return multiplier * parseFloat(num);
}

function checkCloudfront(cloudfront: CloudFrontConfig): string[] {
    const errors = [];

    const logging = cloudfront.logging;
    if (logging && logging !== 'enabled' && logging !== 'disabled') {
        errors.push(`${SERVICE_NAME} - 'cloudfront' -  The 'logging' parameter must be either 'enabled' or 'disabled'`);
    }
    const priceClass = cloudfront.price_class;
    if (priceClass) {
        const priceString = String(priceClass);
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
        const badName = cloudfront.dns_names.some(name => !route53Calls.isValidHostname(name));

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

export function check(serviceContext: ServiceContext<S3StaticSiteServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors = [];
    const serviceParams = serviceContext.params;

    if (!serviceParams.path_to_code) {
        errors.push(`${SERVICE_NAME} - The 'path_to_code' parameter is required`);
    }
    const versioning = serviceParams.versioning;
    if (versioning && versioning !== 'enabled' && versioning !== 'disabled') {
        errors.push(`${SERVICE_NAME} - The 'versioning' parameter must be either 'enabled' or 'disabled'`);
    }

    if (serviceParams.cloudfront) {
        const cfErrors = checkCloudfront(serviceParams.cloudfront);
        errors.push(...cfErrors);
    }

    return errors;
}

export async function deploy(ownServiceContext: ServiceContext<S3StaticSiteServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = ownServiceContext.stackName();
    winston.info(`${SERVICE_NAME} - Deploying static website '${stackName}'`);

    const loggingBucketName = await s3DeployersCommon.createLoggingBucketIfNotExists(ownServiceContext.accountConfig);
    const compiledTemplate = await getCompiledS3Template(ownServiceContext, stackName, loggingBucketName!);
    const stackTags = tagging.getTags(ownServiceContext);
    const deployedStack = await deployPhase.deployCloudFormationStack(ownServiceContext, stackName, compiledTemplate, [], true, 120, stackTags);
    const bucketName = awsCalls.cloudFormation.getOutput('BucketName', deployedStack)!;
    // Upload files from path_to_website to S3
    winston.info(`${SERVICE_NAME} - Uploading code files to static site '${stackName}'`);
    await s3Calls.uploadDirectory(bucketName, '', ownServiceContext.params.path_to_code);
    winston.info(`${SERVICE_NAME} - Finished uploading code files to static site '${stackName}'`);
    winston.info(`${SERVICE_NAME} - Finished deploying static site '${stackName}'`);
    return new DeployContext(ownServiceContext);
}

export async function unDeploy(ownServiceContext: ServiceContext<S3StaticSiteServiceConfig>): Promise<UnDeployContext> {
    return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedTypes = [];

export const producedDeployOutputTypes = [];

export const consumedDeployOutputTypes = [];

export const supportsTagging = true;
