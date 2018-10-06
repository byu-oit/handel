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
import { ServiceConfig, Tags } from 'handel-extension-api';

export interface S3StaticSiteServiceConfig extends ServiceConfig {
    path_to_code: string;
    bucket_name?: string;
    versioning?: string;
    index_document?: string;
    error_document?: string;
    cloudfront?: CloudFrontConfig;
}

export interface CloudFrontConfig {
    https_certificate?: string;
    dns_names?: string[];
    price_class?: string|number;
    logging?: string;
    min_ttl?: string;
    max_ttl?: string;
    default_ttl?: string;
    minimum_https_protocol?: string;
}

export interface HandlebarsS3StaticSiteTemplate {
    bucketName: string;
    versioningStatus: string;
    loggingBucketName: string;
    logFilePrefix: string;
    indexDocument: string;
    errorDocument: string;
    tags: Tags;
    cloudfront?: HandlebarsCloudFrontParams;
}

export interface HandlebarsCloudFrontParams {
    logging: boolean;
    minTTL: number;
    maxTTL: number;
    defaultTTL: number;
    priceClass: string;
    httpsCertificateId?: string;
    dnsNames?: HandlebarsCloudFrontDnsName[];
    minimumHttpsProtocol: string;
}

export interface HandlebarsCloudFrontDnsName {
    name: string;
    zoneId: string;
}
