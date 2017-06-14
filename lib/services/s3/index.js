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
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../common/bind-phase-common');
const handlebarsUtils = require('../../common/handlebars-utils');

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


function getCompiledS3Template(stackName, ownServiceContext) {
    let serviceParams = ownServiceContext.params;

    let bucketName = serviceParams.bucket_name || stackName;
    let versioningStatus = "Suspended";
    if (serviceParams.versioning) {
        versioningStatus = VERSIONING_PARAM_MAPPING[serviceParams.versioning];
    }

    let handlebarsParams = {
        bucketName: bucketName,
        versioningStatus: versioningStatus,
        tags: deployPhaseCommon.getCommonTagsFromServiceContext(ownServiceContext)
    };

    //Add user-defined tags if specified
    if (serviceParams.tags) {
        handlebarsParams.tags = Object.assign(handlebarsParams.tags, serviceParams.tags);
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/s3-template.yml`, handlebarsParams)
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext) {
    let errors = [];

    let params = serviceContext.params;
    if (params.versioning && (params.versioning !== 'enabled' && params.versioning !== 'disabled')) {
        errors.push(`${SERVICE_NAME} - 'versioning' parameter must be either 'enabled' or 'disabled'`);
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
    winston.info(`${SERVICE_NAME} - Deploying S3 bucket ${stackName}`);

    return getCompiledS3Template(stackName, ownServiceContext)
        .then(compiledTemplate => {
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME);
        })
        .then(createdOrUpdatedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying S3 bucket ${stackName}`);
            return getDeployContext(ownServiceContext, createdOrUpdatedStack);
        });
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't consume events from other services`));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't currently produce events for other services`));
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

exports.producedEventsSupportedServices = []; //TODO - No events supported yet, but we will support some like Lambda

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

exports.consumedDeployOutputTypes = [];
