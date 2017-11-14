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
const DeployContext = require('../../datatypes/deploy-context').DeployContext;
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const handlebarsUtils = require('../../common/handlebars-utils');

const SERVICE_NAME = "KMS";

function getDeployContext(serviceContext, cfStack) {
    let keyId = cloudFormationCalls.getOutput('KeyId', cfStack);
    let keyArn = cloudFormationCalls.getOutput('KeyArn', cfStack);
    let aliasName = cloudFormationCalls.getOutput('AliasName', cfStack);
    let aliasArn = cloudFormationCalls.getOutput('AliasArn', cfStack);

    let deployContext = new DeployContext(serviceContext);

    deployContext.addEnvironmentVariables(deployPhaseCommon.getInjectedEnvVarsFor(serviceContext, {
        'KEY_ID': keyId,
        'KEY_ARN': keyArn,
        'ALIAS_NAME': aliasName,
        'ALIAS_ARN': aliasArn
    }));

    //Set up key use policies
    deployContext.policies.push({
        "Effect": "Allow",
        "Action": [
            "kms:DescribeKey",
            "kms:Encrypt",
            "kms:Decrypt",
            "kms:GenerateDataKey",
            "kms:GenerateDataKeyWithoutPlaintext",
            "kms:ReEncryptFrom",
            "kms:ReEncryptTo",
        ],
        "Resource": [
            keyArn
        ]
    });

    return deployContext;
}


function getCompiledTemplate(ownServiceContext) {
    let serviceParams = ownServiceContext.params;

    let autoRotate = serviceParams.hasOwnProperty('auto_rotate') ? !!serviceParams.auto_rotate : true;

    let handlebarsParams = {
        autoRotate: autoRotate,
        alias: serviceParams.alias || getDefaultAlias(ownServiceContext)
    };

    return handlebarsUtils.compileTemplate(`${__dirname}/kms-template.yml`, handlebarsParams)
}

function getDefaultAlias(context) {
    return `${context.appName}/${context.environmentName}/${context.serviceName}`;
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext, dependenciesServiceContexts) {
    let errors = [];

    let params = serviceContext.params;

    if (params.alias) {
        let alias = params.alias;
        if (alias.startsWith('AWS')) {
            errors.push("'alias' parameter must not begin with 'AWS'")
        }
        if (!alias.match(/^[-\/_a-z0-9]+$/i)) {
            errors.push("'alias' parameter must only contain alphanumeric characters, dashes ('-'), underscores ('_'), or slashes ('/')");
        }
    }

    return errors.map(it => `${SERVICE_NAME} - ${it}`);
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying KMS Key ${stackName}`);

    return getCompiledTemplate(ownServiceContext)
        .then(compiledTemplate => {
            let stackTags = deployPhaseCommon.getTags(ownServiceContext);
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], true, SERVICE_NAME, stackTags);
        })
        .then(createdOrUpdatedStack => {
            winston.info(`${SERVICE_NAME} - Finished deploying KMS Key ${stackName}`);
            return getDeployContext(ownServiceContext, createdOrUpdatedStack);
        });
}

exports.unDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

exports.consumedDeployOutputTypes = [];
