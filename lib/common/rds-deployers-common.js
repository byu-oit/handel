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
const cloudFormationCalls = require('../aws/cloudformation-calls');
const deployPhaseCommon = require('../common/deploy-phase-common');
const DeployContext = require('../datatypes/deploy-context');
const ssmCalls = require('../aws/ssm-calls');
const uuid = require('uuid');

exports.getDeployContext = function (serviceContext, rdsCfStack) {
    let deployContext = new DeployContext(serviceContext);

    //Inject ENV variables to talk to this database
    let address = cloudFormationCalls.getOutput('DatabaseAddress', rdsCfStack);
    let port = cloudFormationCalls.getOutput('DatabasePort', rdsCfStack);
    let dbName = cloudFormationCalls.getOutput('DatabaseName', rdsCfStack);

    deployContext.addEnvironmentVariables(
        deployPhaseCommon.getInjectedEnvVarsFor(serviceContext, {
            ADDRESS: address,
            PORT: port,
            DATABASE_NAME: dbName
        })
    );

    return deployContext;
}

exports.addDbCredentialToParameterStore = function (ownServiceContext, dbUsername, dbPassword, deployedStack) {
    //Add credential to EC2 Parameter Store
    let usernameParamName = deployPhaseCommon.getSsmParamName(ownServiceContext, "db_username");
    let passwordParamName = deployPhaseCommon.getSsmParamName(ownServiceContext, "db_password");
    return Promise.all([
        ssmCalls.storeParameter(usernameParamName, 'SecureString', dbUsername),
        ssmCalls.storeParameter(passwordParamName, 'SecureString', dbPassword)
    ])
    .then(() => {
        return deployedStack;
    });
}

exports.deleteParametersFromParameterStore = function (ownServiceContext, unDeployContext) {
    let paramsToDelete = [
        deployPhaseCommon.getSsmParamName(ownServiceContext, "db_username"),
        deployPhaseCommon.getSsmParamName(ownServiceContext, "db_password")
    ]
    return ssmCalls.deleteParameters(paramsToDelete)
        .then(() => {
            return unDeployContext;
        });
}

exports.getNewDbUsername = function () {
    //This is a really hacky username generator that matches all the requirements of the different engines
    //Someone should really put a better way for generating these in here...
    return 'h' + uuid().replace(/-/gi, '').substring(0, 15);
}

exports.getNewDbPassword = function () {
    //This is a really hacky password generator that matches all the requirements of the different engines
    //Someone should really put a better way for generating these in here...
    return uuid().substring(0, 30);
}