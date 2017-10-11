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
const sesCalls = require('../../aws/ses-calls');
const deployPhaseCommon = require('../../common/deploy-phase-common');

const EMAIL_ADDRESS = /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
const SERVICE_NAME = "SES";

function getDeployContext(serviceContext) {
    const deployContext = new DeployContext(serviceContext);

    const account = serviceContext.accountConfig.account_id;
    const address = serviceContext.params.address;
    const region = serviceContext.accountConfig.region;
    const identityArn = `arn:aws:ses:${region}:${account}:identity/${address}`

    // Env variables to inject into consuming services
    deployContext.addEnvironmentVariables(deployPhaseCommon.getInjectedEnvVarsFor(serviceContext, {
        EMAIL_ADDRESS: address,
        IDENTITY_ARN: identityArn
    }));

    //Policy to talk to this queue
    deployContext.policies.push({
        "Effect": "Allow",
        "Action": [
            "ses:SendEmail"
        ],
        "Resource": [
            identityArn
        ]
    });

    return deployContext;
}


/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext, dependenciesServiceContexts) {
    let errors = [];

    if (!EMAIL_ADDRESS.test(serviceContext.params.address))
        errors.push(`${SERVICE_NAME} - An address must be a valid email address`);

    return errors;
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    const address = ownServiceContext.params.address;
    winston.info(`${SERVICE_NAME} - Deploying email address ${address}`);

    return sesCalls.verifyEmailAddress(address)
        .then(() => {
            winston.info(`${SERVICE_NAME} - Finished deploying email address ${address}`);
            return getDeployContext(ownServiceContext);
        });
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

exports.consumedDeployOutputTypes = [];
