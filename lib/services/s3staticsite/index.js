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
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployersCommon = require('../../common/deployers-common')
const accountConfig = require('../../common/account-config')().getAccountConfig();;
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const handlebarsUtils = require('../../common/handlebars-utils');

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
        errorDocument
    };
    //Inject tags (if any)
    if (serviceParams.tags) {
        handlebarsParams.tags = serviceParams.tags;
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/s3-static-site-template.yml`, handlebarsParams)
}

function createLoggingBucketIfNotExists() {
    let stackName = "HandelStaticSiteLoggingBucket";
    return cloudFormationCalls.getStack(stackName)
        .then(stack => {
            if (!stack) {
                let bucketName = `handel-static-site-logging-${accountConfig.region}-${accountConfig.account_id}`;
                let handlebarsParams = {
                    bucketName
                }

                return handlebarsUtils.compileTemplate(`${__dirname}/s3-static-site-logging-bucket.yml`, handlebarsParams)
                    .then(compiledTemplate => {
                        winston.info(`Creating logging bucket for static websites '${bucketName}'`);
                        return cloudFormationCalls.createStack(stackName, compiledTemplate, []);
                    });
            }
            else {
                return stack;
            }
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

    if(!serviceParams.path_to_code) {
        errors.push(`S3 Static Site - The 'path_to_code' parameter is required`);
    }

    return errors;
}

exports.preDeploy = function (serviceContext) {
    winston.info(`S3 Static Site - PreDeploy is not required for this service, skipping it`);
    return Promise.resolve(new PreDeployContext(serviceContext));
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`S3 Static Site - Bind is not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`S3 Static Site - Deploying S3 static website ${stackName}`);

    return createLoggingBucketIfNotExists()
        .then(loggingBucketName => {
            return getCompiledS3Template(ownServiceContext, stackName, loggingBucketName)
        })
        .then(compiledTemplate => {
            return cloudFormationCalls.getStack(stackName)
                .then(stack => {
                    if (!stack) { //Create
                        winston.info(`S3 Static Site - Creating S3 static site '${stackName}'`);
                        return cloudFormationCalls.createStack(stackName, compiledTemplate, []);
                    }
                    else {
                        winston.info(`S3 Static Site - Updating S3 static site '${stackName}'`);
                        return cloudFormationCalls.updateStack(stackName, compiledTemplate, []);
                    }
                });
        })
        .then(createdOrUpdatedStack => {
            let bucketName = cloudFormationCalls.getOutput("BucketName", createdOrUpdatedStack);
            //Upload files from path_to_website to S3
            winston.info(`Uploading code files to static site '${stackName}'`);
            return s3Calls.uploadDirectory(bucketName, "", ownServiceContext.params.path_to_code)
                .then(() => {
                    winston.info(`Finished uploading code files to static site '${stackName}'`);
                    return createdOrUpdatedStack;
                });
        })
        .then(createdOrUpdatedStack => {
            winston.info(`S3 Static Site - Finished deploying S3 static site '${stackName}'`);
            return new DeployContext(ownServiceContext);
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error("The S3 Static Site service doesn't consume events from other services"));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error("The S3 Static Site service doesn't produce events for other services"));
}

exports.unPreDeploy = function (ownServiceContext) {
    winston.info(`S3 Static Site - UnPreDeploy is not required for this service`);
    return Promise.resolve(new UnPreDeployContext(ownServiceContext));
}

exports.unBind = function (ownServiceContext) {
    winston.info(`S3 Static Site - UnBind is not required for this service`);
    return Promise.resolve(new UnBindContext(ownServiceContext));
}

exports.unDeploy = function (ownServiceContext) {
    return deployersCommon.unDeployCloudFormationStack(ownServiceContext, 'S3 Static Site');
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [];

exports.consumedDeployOutputTypes = [];
