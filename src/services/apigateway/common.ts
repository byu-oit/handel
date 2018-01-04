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
import * as _ from 'lodash';
import * as cloudformationCalls from '../../aws/cloudformation-calls';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as util from '../../common/util';
import { DeployContext, EnvironmentVariables, PreDeployContext, ServiceContext } from '../../datatypes/index';
import { APIGatewayConfig } from './config-types';

export function getEnvVarsForService(ownEnvironmentVariables: EnvironmentVariables | undefined, ownServiceContext: ServiceContext<APIGatewayConfig>, dependenciesDeployContexts: DeployContext[]) {
    let returnEnvVars = {};

    if(ownEnvironmentVariables) {
        returnEnvVars = _.assign(returnEnvVars, ownEnvironmentVariables);
    }

    const dependenciesEnvVars = deployPhaseCommon.getEnvVarsFromDependencyDeployContexts(dependenciesDeployContexts);
    returnEnvVars = _.assign(returnEnvVars, dependenciesEnvVars);
    const handelInjectedEnvVars = deployPhaseCommon.getEnvVarsFromServiceContext(ownServiceContext);
    returnEnvVars = _.assign(returnEnvVars, handelInjectedEnvVars);

    return returnEnvVars;
}

export function getSecurityGroups(ownPreDeployContext: PreDeployContext): string[] {
    const securityGroups: string[] = [];
    if (ownPreDeployContext.securityGroups) {
        ownPreDeployContext.securityGroups.forEach((secGroup) => {
            securityGroups.push(secGroup.GroupId!);
        });
    }
    return securityGroups;
}

export function getRestApiUrl(cfStack: AWS.CloudFormation.Stack, serviceContext: ServiceContext<APIGatewayConfig>) {
    const restApiId = cloudformationCalls.getOutput('RestApiId', cfStack);
    const restApiDomain = `${restApiId}.execute-api.${serviceContext.accountConfig.region}.amazonaws.com`;
    const stageName = serviceContext.environmentName; // Env name is the stage name
    return `https://${restApiDomain}/${stageName}/`;
}

export function getPolicyStatementsForLambdaRole(serviceContext: ServiceContext<APIGatewayConfig>, dependenciesDeployContexts: DeployContext[]) {
    let ownPolicyStatements;
    if (serviceContext.params.vpc) {
        ownPolicyStatements = JSON.parse(util.readFileSync(`${__dirname}/lambda-role-statements-vpc.json`));
    } else {
        ownPolicyStatements = JSON.parse(util.readFileSync(`${__dirname}/lambda-role-statements.json`));
    }
    ownPolicyStatements = ownPolicyStatements.concat(deployPhaseCommon.getAppSecretsAccessPolicyStatements(serviceContext));

    return deployPhaseCommon.getAllPolicyStatementsForServiceRole(ownPolicyStatements, dependenciesDeployContexts);
}
