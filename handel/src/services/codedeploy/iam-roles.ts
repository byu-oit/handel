/*
 * Copyright 2018 Brigham Young University
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
import { DeployContext, ServiceContext } from 'handel-extension-api';
import * as extensionSupport from 'handel-extension-support';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as util from '../../common/util';
import { CodeDeployServiceConfig } from './config-types';

export async function getStatementsForInstanceRole(ownServiceContext: ServiceContext<CodeDeployServiceConfig>, dependenciesDeployContexts: DeployContext[]): Promise<any[]> {
    const accountConfig = ownServiceContext.accountConfig;
    const ownPolicyStatementsTemplate = `${__dirname}/codedeploy-instance-role-statements.handlebars`;
    const handlebarsParams = {
        region: accountConfig.region,
        handelBucketName: deployPhaseCommon.getHandelUploadsBucketName(accountConfig)
    };
    const compiledPolicyStatements = await extensionSupport.handlebars.compileTemplate(ownPolicyStatementsTemplate, handlebarsParams);
    let ownPolicyStatements = JSON.parse(compiledPolicyStatements);
    ownPolicyStatements = ownPolicyStatements.concat(deployPhaseCommon.getAppSecretsAccessPolicyStatements(ownServiceContext));
    return deployPhaseCommon.getAllPolicyStatementsForServiceRole(ownPolicyStatements, dependenciesDeployContexts);
}

export async function createCodeDeployServiceRoleIfNotExists(ownServiceContext: ServiceContext<CodeDeployServiceConfig>): Promise<AWS.IAM.Role> {
    const accountConfig = ownServiceContext.accountConfig;
    const policyStatements = JSON.parse(util.readFileSync(`${__dirname}/codedeploy-service-role-statements.json`));
    const createdRole = await deployPhaseCommon.createCustomRole('codedeploy.amazonaws.com', 'HandelCodeDeployServiceRole', policyStatements, accountConfig);
    if (!createdRole) {
        throw new Error('Expected role to be created for CodeDeploy service, but none was returned');
    }
    return createdRole;
}
