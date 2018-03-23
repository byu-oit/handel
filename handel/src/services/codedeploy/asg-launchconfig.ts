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
import * as ec2Calls from '../../aws/ec2-calls';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as handlebarsUtils from '../../common/handlebars-utils';
import * as instanceAutoScaling from '../../common/instance-auto-scaling';
import { DeployContext, EnvironmentVariables, ServiceContext } from '../../datatypes';
import { CodeDeployServiceConfig, HandlebarsCodeDeployAutoScalingConfig } from './config-types';

export async function getCodeDeployAmi(): Promise<AWS.EC2.Image> {
    // Just use the AWS AMI for now
    const ami = await ec2Calls.getLatestAmiByName('amazon', 'amzn-ami-hvm');
    if (!ami) {
        throw new Error('Could not find the latest Amazon AMI');
    }
    return ami;
}

export function getAutoScalingConfig(ownServiceContext: ServiceContext<CodeDeployServiceConfig>): HandlebarsCodeDeployAutoScalingConfig {
    const params = ownServiceContext.params;
    const autoScalingConfig: HandlebarsCodeDeployAutoScalingConfig = { // Set initial defaults
        minInstances: 1,
        maxInstances: 1,
        cooldown: '300', // TODO - Change this later
        scalingPolicies: instanceAutoScaling.getScalingPoliciesConfig(ownServiceContext)
    };

    // Set min/max to user-defined if specified
    if(params.auto_scaling) {
        if(params.auto_scaling.min_instances) { autoScalingConfig.minInstances = params.auto_scaling.min_instances; }
        if(params.auto_scaling.max_instances) { autoScalingConfig.maxInstances = params.auto_scaling.max_instances; }
    }

    return autoScalingConfig;
}

export async function getUserDataScript(ownServiceContext: ServiceContext<CodeDeployServiceConfig>, dependenciesDeployContexts: DeployContext[]): Promise<string> {
    const params = ownServiceContext.params;

    // Add scripts from dependencies
    const dependencyScripts: string[] = [];
    for (const deployContext of dependenciesDeployContexts) {
        for (const script of deployContext.scripts) {
            dependencyScripts.push(script);
        }
    }
    const agentInstallVariables = {
        region: ownServiceContext.accountConfig.region
    };
    const codeDeployInstallScript = await handlebarsUtils.compileTemplate(`${__dirname}/codedeploy-agent-install-fragment.handlebars`, agentInstallVariables);

    const userdataVariables = {
        dependencyScripts,
        codeDeployInstallScript
    };
    return handlebarsUtils.compileTemplate(`${__dirname}/codedeploy-instance-userdata-template.handlebars`, userdataVariables);
}
