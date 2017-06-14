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
const DeployContext = require('../../datatypes/deploy-context');
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../common/bind-phase-common');
const accountConfig = require('../../common/account-config')().getAccountConfig();
const handlebarsUtils = require('../../common/handlebars-utils');

const SERVICE_NAME = "S3 Static Site";
const VERSIONING_PARAM_MAPPING = {
    enabled: 'Enabled',
    disabled: 'Suspended'
}

function getCompiledS3Template(ownServiceContext, stackName, loggingBucketName) {
    let serviceParams = ownServiceContext.params;

    let bucketName = serviceParams.bucket_name || stackName;
    let versioningStatus = VERSIONING_PARAM_MAPPING[serviceParams.versioning] || 'Suspended';
    let logFilePrefix = `${ownServiceContext.appName}/${ownServiceContext.environmentName}/${ownServiceContext.serviceName}/`;
    let indexDocument = serviceParams.index_document || 'index.html';
    let errorDocument = serviceParams.error_document || 'error.html';

    let handlebarsParams = {
        bucketName,
        versioningStatus,
        loggingBucketName,
        logFilePrefix,
        indexDocument,
        errorDocument,
        tags: deployPhaseCommon.getTags(ownServiceContext)
    };

    return handlebarsUtils.compileTemplate(`${__dirname}/s3-static-site-template.yml`, handlebarsParams)
}

function createLoggingBucketIfNotExists() {
    let stackName = "HandelStaticSiteLoggingBucket";
    let bucketName = `handel-static-site-logging-${accountConfig.region}-${accountConfig.account_id}`;
    let handlebarsParams = {
        bucketName
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/s3-static-site-logging-bucket.yml`, handlebarsParams)
        .then(compiledTemplate => {
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], false, "Logging Bucket for S3 Static Sites");
        })
        .then(deployedStack => {
            return cloudFormationCalls.getOutput("BucketName", deployedStack);
        });
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext) {
    let errors = [];
    let serviceParams = serviceContext.params;

    if (!serviceParams.path_to_code) {
        errors.push(`${SERVICE_NAME} - The 'path_to_code' parameter is required`);
    }

    return errors;
}

exports.preDeploy = function (serviceContext) {
    return preDeployPhaseCommon.preDeployNotRequired(serviceContext, SERVICE_NAME);
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    return bindPhaseCommon.bindNotRequired(ownServiceContext, dependentOfServiceContext, SERVICE_NAME);
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying S3 static website '${stackName}'`);

    return createLoggingBucketIfNotExists()
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
            winston.info(`${SERVICE_NAME} - Finished deploying S3 static site '${stackName}'`);
            return new DeployContext(ownServiceContext);
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't consume events from other services`));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't produce events for other services`));
}

exports.unPreDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unPreDeployNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.unBind = function (ownServiceContext) {
    return deletePhasesCommon.unBindNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.unDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unDeployCloudFormationStack(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [];

exports.consumedDeployOutputTypes = [];
