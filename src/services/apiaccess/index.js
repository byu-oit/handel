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
const DeployContext = require('../../datatypes').DeployContext;
const fs = require('fs');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const util = require('../../common/util');

const SERVICE_NAME = "API Access";

function getDeployContext(serviceContext) {
    let serviceParams = serviceContext.params;
    let deployContext = new DeployContext(serviceContext);

    //Inject policies
    for (let service of serviceParams.aws_services) {
        let statementsPath = `${__dirname}/${service}-statements.json`;
        let serviceStatements = JSON.parse(util.readFileSync(statementsPath));
        for (let serviceStatement of serviceStatements) {
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

exports.check = function (serviceContext, dependenciesServiceContexts) {
    let errors = [];

    let serviceParams = serviceContext.params;
    if (!serviceParams.aws_services) {
        errors.push(`${SERVICE_NAME} - The 'aws_services' parameter is required.`);
    }
    else {
        for (let service of serviceParams.aws_services) {
            let statementsPath = `${__dirname}/${service}-statements.json`;
            if (!fs.existsSync(statementsPath)) {
                errors.push(`${SERVICE_NAME} - The 'aws_service' value '${service}' is not supported`);
            }
        }
    }

    return errors;
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying ${SERVICE_NAME} '${stackName}'`);
    return Promise.resolve(getDeployContext(ownServiceContext))
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'policies'
];

exports.consumedDeployOutputTypes = [];
