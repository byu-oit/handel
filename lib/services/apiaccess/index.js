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
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const fs = require('fs');
const deployersCommon = require('../../common/deployers-common');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const UnDeployContext = require('../../datatypes/un-deploy-context');
const util = require('../../common/util');

function getDeployContext(serviceContext) {
    let serviceParams = serviceContext.params;
    let deployContext = new DeployContext(serviceContext);

    //Inject policies
    for (let service of serviceParams.aws_services) {
        let statementsPath = `${__dirname}/${service}-statements.json`;
        let serviceStatements = JSON.parse(util.readFileSync(statementsPath));
        for(let serviceStatement of serviceStatements) {
            deployContext.policies.push(serviceStatement);
        }
    }

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
    if (!serviceParams.aws_services) {
        errors.push("API Access - The 'aws_services' parameter is required.");
    }
    else {
        for (let service of serviceParams.aws_services) {
            let statementsPath = `${__dirname}/${service}-statements.json`;
            if (!fs.existsSync(statementsPath)) {
                errors.push(`API Access - The 'aws_service' value '${service}' is not supported`);
            }
        }
    }

    return errors;
}


exports.preDeploy = function (serviceContext) {
    winston.info(`API Access - PreDeploy is not required for this service, skipping it`);
    return Promise.resolve(new PreDeployContext(serviceContext));
}


exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`API Access - Bind is not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
}


exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`API Access - Deploying api access ${stackName}`);

    return Promise.resolve(getDeployContext(ownServiceContext))
}

exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error("The API Access service doesn't consume events from other services"));
}


exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error("The API Access service doesn't currently produce events for other services"));
}

exports.unPreDeploy = function (ownServiceContext) {
    winston.info(`API Access - UnPreDeploy is not required for this service`);
    return Promise.resolve(new UnPreDeployContext(ownServiceContext));
}

exports.unBind = function (ownServiceContext) {
    winston.info(`API Access - UnBind is not required for this service`);
    return Promise.resolve(new UnBindContext(ownServiceContext));
}

exports.unDeploy = function (ownServiceContext) {
    winston.info(`API Access - Nothing to delete for this service`);
    return Promise.resolve(new UnDeployContext(ownServiceContext));
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'policies'
];

exports.consumedDeployOutputTypes = [];
