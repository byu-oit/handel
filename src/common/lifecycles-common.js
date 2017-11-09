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
const PreDeployContext = require('../datatypes/pre-deploy-context').PreDeployContext;
const BindContext = require('../datatypes/bind-context').BindContext;
const DeployContext = require('../datatypes/deploy-context').DeployContext;
const UnPreDeployContext = require('../datatypes/un-pre-deploy-context').UnPreDeployContext;
const UnDeployContext = require('../datatypes/un-deploy-context').UnDeployContext;
const UnBindContext = require('../datatypes/un-bind-context').UnBindContext;

exports.preDeployNotRequired = function (serviceContext) {
    winston.debug(`${serviceContext.serviceType} - PreDeploy is not required for this service, skipping it`);
    return Promise.resolve(new PreDeployContext(serviceContext));
}

exports.bindNotRequired = function (ownServiceContext, dependentOfServiceContext) {
    winston.debug(`${ownServiceContext.serviceType} - Bind is not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
}

exports.deployNotRequired = function (ownServiceContext) {
    winston.debug(`${ownServiceContext.serviceType} - Deploy is not required for this service, skipping it`);
    return Promise.resolve(new DeployContext(ownServiceContext));
}

exports.unPreDeployNotRequired = function (ownServiceContext) {
    winston.debug(`${ownServiceContext.serviceType} - UnPreDeploy is not required for this service`);
    return Promise.resolve(new UnPreDeployContext(ownServiceContext));
}

exports.unBindNotRequired = function (ownServiceContext) {
    winston.debug(`${ownServiceContext.serviceType} - UnBind is not required for this service`);
    return Promise.resolve(new UnBindContext(ownServiceContext));
}

exports.unDeployNotRequired = function (ownServiceContext) {
    winston.debug(`${ownServiceContext.serviceType} - UnDeploy is not required for this service`);
    return Promise.resolve(new UnDeployContext(ownServiceContext));
}