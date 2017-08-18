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
const accountConfig = require('../common/account-config')().getAccountConfig();
const ec2Calls = require('../aws/ec2-calls');
const cloudformationCalls = require('../aws/cloudformation-calls');
const s3Calls = require('../aws/s3-calls');
const winston = require('winston');
const UnDeployContext = require('../datatypes/un-deploy-context');
const UnPreDeployContext = require('../datatypes/un-pre-deploy-context');
const UnBindContext = require('../datatypes/un-bind-context');
const deployPhaseCommon = require('./deploy-phase-common');

function unBindAllOnSg(stackName) {
    let sgName = `${stackName}-sg`;
    return ec2Calls.removeAllIngressFromSg(sgName, accountConfig.vpc)
        .then(() => {
            return true;
        });
}

function deleteSecurityGroupForService(stackName) {
    let sgName = `${stackName}-sg`;
    return cloudformationCalls.getStack(sgName)
        .then(stack => {
            if (stack) {
                return cloudformationCalls.deleteStack(sgName)
            }
            else {
                return true;
            }
        });
}

exports.unDeployService = function (serviceContext, serviceType) {
    let stackName = deployPhaseCommon.getResourceName(serviceContext);
    winston.info(`${serviceType} - Undeploying service '${stackName}'`)

    return cloudformationCalls.getStack(stackName)
        .then(stack => {
            if (stack) {
                winston.debug(`${serviceType} - Deleting stack '${stackName}'`);
                return cloudformationCalls.deleteStack(stackName);
            }
            else {
                winston.debug(`${serviceType} - Stack '${stackName}' has already been deleted`);
            }
        })
        .then(() => {
          let name = {
            bucket: `handel-${accountConfig.region}-${accountConfig.account_id}`,
            prefix: `${serviceContext.appName}/${serviceContext.environmentName}/${serviceContext.serviceName}`
          };
          return s3Calls.deleteMatchingPrefix(name.bucket,name.prefix);
        })
        .then(() => {
            winston.info(`${serviceType} -- Finished undeploying service '${stackName}'`)
            return new UnDeployContext(serviceContext);
        });
}

exports.unPreDeploySecurityGroup = function (ownServiceContext, serviceName) {
    let sgName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${serviceName} - Deleting security group '${sgName}'`);

    return deleteSecurityGroupForService(sgName)
        .then(success => {
            winston.info(`${serviceName} - Finished deleting security group '${sgName}'`);
            return new UnPreDeployContext(ownServiceContext);
        });
}

exports.unBindSecurityGroups = function (ownServiceContext, serviceName) {
    let sgName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${serviceName} - Unbinding security group '${sgName}'`);

    return unBindAllOnSg(sgName)
        .then(success => {
            winston.info(`${serviceName} - Finished unbinding seucrity group '${sgName}'`);
            return new UnBindContext(ownServiceContext);
        });
}

exports.unPreDeployNotRequired = function (ownServiceContext, serviceName) {
    winston.debug(`${serviceName} - UnPreDeploy is not required for this service`);
    return Promise.resolve(new UnPreDeployContext(ownServiceContext));
}

exports.unBindNotRequired = function (ownServiceContext, serviceName) {
    winston.debug(`${serviceName} - UnBind is not required for this service`);
    return Promise.resolve(new UnBindContext(ownServiceContext));
}

exports.unDeployNotRequired = function (ownServiceContext, serviceName) {
    winston.debug(`${serviceName} - UnDeploy is not required for this service`);
    return Promise.resolve(new UnDeployContext(ownServiceContext));
}
