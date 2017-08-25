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
const handlebarsUtils = require('./handlebars-utils');
const accountConfig = require('./account-config')().getAccountConfig();
const deployPhaseCommon = require('./deploy-phase-common');
const cloudFormationCalls = require('../aws/cloudformation-calls');

exports.createLoggingBucketIfNotExists = function() {
    let stackName = "HandelS3LoggingBucket";
    let bucketName = `handel-s3-bucket-logging-${accountConfig.region}-${accountConfig.account_id}`;
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

exports.getLogFilePrefix = function(serviceContext) {
    return `${serviceContext.appName}/${serviceContext.environmentName}/${serviceContext.serviceName}/`;
}