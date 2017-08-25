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
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../common/account-config')().getAccountConfig();
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const s3DeployersCommon = require('../../common/s3-deployers-common');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../common/bind-phase-common');
const handlebarsUtils = require('../../common/handlebars-utils');
const lifecycleSection = require('./lifecycles');

const SERVICE_NAME = "S3";
const VERSIONING_PARAM_MAPPING = {
    enabled: 'Enabled',
    disabled: 'Suspended'
}

function getDeployContext(serviceContext, cfStack) {
    let bucketName = cloudFormationCalls.getOutput('BucketName', cfStack);
    let deployContext = new DeployContext(serviceContext);

    //Env variables to inject into consuming services
    let bucketNameEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, 'BUCKET_NAME');
    deployContext.environmentVariables[bucketNameEnv] = bucketName;
    let bucketUrlEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, "BUCKET_URL");
    deployContext.environmentVariables[bucketUrlEnv] = `https://${bucketName}.s3.amazonaws.com/`
    let regionEndpointEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, "REGION_ENDPOINT");
    deployContext.environmentVariables[regionEndpointEnv] = `s3-${accountConfig.region}.amazonaws.com`;

    //Need two policies for accessing S3. The first allows you to list the contents of the bucket,
    // and the second allows you to modify objects in that bucket
    deployContext.policies.push({
        "Effect": "Allow",
        "Action": [
            "s3:ListBucket"
        ],
        "Resource": [
            `arn:aws:s3:::${bucketName}`
        ]
    })
    deployContext.policies.push({
        "Effect": "Allow",
        "Action": [
            "s3:PutObject",
            "s3:GetObject",
            "s3:DeleteObject"
        ],
        "Resource": [
            `arn:aws:s3:::${bucketName}/*`
        ]
    });

    return deployContext;
}


function getCompiledS3Template(stackName, ownServiceContext, loggingBucketName) {
    let serviceParams = ownServiceContext.params;

    let bucketName = serviceParams.bucket_name || stackName;
    let versioningStatus = "Suspended";
    if (serviceParams.versioning) {
        versioningStatus = VERSIONING_PARAM_MAPPING[serviceParams.versioning];
    }


    let handlebarsParams = {
        bucketName: bucketName,
        bucketACL: serviceParams.bucket_acl,
        versioningStatus: versioningStatus,
        tags: deployPhaseCommon.getTags(ownServiceContext),
        lifecycle_policy: lifecycleSection.getLifecycleConfig(ownServiceContext)
    };

    if(serviceParams.logging && serviceParams.logging === 'enabled') {
        handlebarsParams.loggingBucketName = loggingBucketName;
        handlebarsParams.logFilePrefix = s3DeployersCommon.getLogFilePrefix(ownServiceContext);
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/s3-template.yml`, handlebarsParams)
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext, dependenciesServiceContexts) {
    let errors = [];
    let valid_acls = ['AuthenticatedRead', 'AwsExecRead', 'BucketOwnerRead', 'BucketOwnerFullControl', 'LogDeliveryWrite', 'Private', 'PublicRead'];

    let params = serviceContext.params;
    if (params.versioning && (params.versioning !== 'enabled' && params.versioning !== 'disabled')) {
        errors.push(`${SERVICE_NAME} - 'versioning' parameter must be either 'enabled' or 'disabled'`);
    }
    if (params.bucket_acl && (!(valid_acls.indexOf(params.bucket_acl) in valid_acls))) {
        errors.push(`${SERVICE_NAME} - 'bucket_acl' parameter must be 'AuthenticatedRead', 'AwsExecRead', 'BucketOwnerRead', 'BucketOwnerFullControl', 'LogDeliveryWrite', 'Private' or 'PublicRead'`);
    }

    lifecycleSection.checkLifecycles(serviceContext, SERVICE_NAME, errors);

    return errors;
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying bucket '${stackName}'`);

    return s3DeployersCommon.createLoggingBucketIfNotExists()
        .then(loggingBucketName => {
            return getCompiledS3Template(stackName, ownServiceContext, loggingBucketName)
        })
        .then(compiledTemplate => {
            let stackTags = deployPhaseCommon.getTags(ownServiceContext);
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME, stackTags);
        })
        .then(createdOrUpdatedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying bucket '${stackName}'`);
            return getDeployContext(ownServiceContext, createdOrUpdatedStack);
        });
}

exports.unPreDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unPreDeployNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.unBind = function (ownServiceContext) {
    return deletePhasesCommon.unBindNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.unDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = []; //TODO - No events supported yet, but we will support some like Lambda

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

exports.consumedDeployOutputTypes = [];
