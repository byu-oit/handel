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
const ProduceEventsContext = require('../../datatypes/produce-events-context');
const lambdaCalls = require('../../aws/lambda-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const preDeployPhaseCommon = require('../../common/pre-deploy-phase-common');
const bindPhaseCommon = require('../../common/bind-phase-common');
const deletePhasesCommon = require('../../common/delete-phases-common');
const yaml = require('js-yaml');
const accountConfig = require('../../common/account-config')().getAccountConfig();

const SERVICE_NAME = "Alexa Skill Kit";

function getDeployContext(ownServiceContext) {
    let deployContext = new DeployContext(ownServiceContext);

    deployContext.eventOutputs.principal = "alexa-appkit.amazon.com";

    return deployContext;
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext) {
    let errors = [];

    let serviceParams = serviceContext.params;
    let valid_regions = ['us-east-1', 'eu-west-1']

    //TODO check region
    if (!(valid_regions.includes(accountConfig.region))) {
        errors.push(`${SERVICE_NAME} - You must deploy to ${valid_regions.join(', ')} to use the Alexa Skill Kit`);
    }

    return errors;
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    return bindPhaseCommon.bindNotRequired(ownServiceContext, dependentOfServiceContext, SERVICE_NAME);
}

exports.deploy = function (ownServiceContext, ownPreDeployContext) {
    winston.debug(`${SERVICE_NAME} - Deploy not currently required for the Alexa Skill Kit service`);
    return Promise.resolve(getDeployContext(ownServiceContext));
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error(`The ${SERVICE_NAME} service doesn't consume events from other services`));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    winston.info(`${SERVICE_NAME} - No events to produce from '${ownServiceContext.serviceName}' for consumer ${consumerServiceContext.serviceName}`);
    return Promise.resolve(new ProduceEventsContext(ownServiceContext, consumerServiceContext));
}

exports.unPreDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unPreDeployNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.unBind = function (ownServiceContext) {
    return deletePhasesCommon.unBindNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.unDeploy = function (ownServiceContext) {
    return deletePhasesCommon.unDeployNotRequired(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [
    'lambda'
];

exports.producedDeployOutputTypes = [];

exports.consumedDeployOutputTypes = [];
