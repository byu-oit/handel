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
const ProduceEventsContext = require('../../datatypes/produce-events-context').ProduceEventsContext;

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

exports.check = function (serviceContext, dependenciesServiceContexts) {
    return [];
}

exports.deploy = function (ownServiceContext, ownPreDeployContext) {
    winston.debug(`${SERVICE_NAME} - Deploy not currently required for the Alexa Skill Kit service`);
    return Promise.resolve(getDeployContext(ownServiceContext));
}

exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    winston.info(`${SERVICE_NAME} - No events to produce from '${ownServiceContext.serviceName}' for consumer ${consumerServiceContext.serviceName}`);
    return Promise.resolve(new ProduceEventsContext(ownServiceContext, consumerServiceContext));
}

exports.producedEventsSupportedServices = [
    'lambda'
];

exports.producedDeployOutputTypes = [];

exports.consumedDeployOutputTypes = [];
