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
const BindContext = require('../datatypes/bind-context');
const deployPhaseCommon = require('./deploy-phase-common');
const ec2Calls = require('../aws/ec2-calls');

exports.bindDependentSecurityGroupToSelf = function (ownServiceContext,
    ownPreDeployContext,
    dependentOfServiceContext,
    dependentOfPreDeployContext,
    protocol,
    port,
    serviceName) {
        
    let stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${serviceName} - Binding security group from '${dependentOfServiceContext.serviceName}' to '${ownServiceContext.serviceName}'`);
    let ownSg = ownPreDeployContext.securityGroups[0];
    let sourceSg = dependentOfPreDeployContext.securityGroups[0];

    return ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, ownSg,
        protocol, port,
        port, ownServiceContext.accountConfig.vpc)
        .then(efsSecurityGroup => {
            winston.info(`${serviceName} - Finished binding security group from '${dependentOfServiceContext.serviceName}' to '${ownServiceContext.serviceName}'`);
            return new BindContext(ownServiceContext, dependentOfServiceContext);
        });
}
