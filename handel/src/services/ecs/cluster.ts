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
import { AccountConfig, DeployContext } from 'handel-extension-api';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as handlebarsUtils from '../../common/handlebars-utils';

/**
 * This function calculates the user data script to be run on the cluster EC2 instances when launching.
 *
 * This script is calculated from the injected scripts from any dependencies that export them, such as EFS.
 */
export async function getUserDataScript(clusterName: string, dependenciesDeployContexts: DeployContext[]): Promise<string> {
    const variables: any = {
        ECS_CLUSTER_NAME: clusterName,
        DEPENDENCY_SCRIPTS: []
    };

    for (const deployContext of dependenciesDeployContexts) {
        for (const script of deployContext.scripts) {
            variables.DEPENDENCY_SCRIPTS.push(script);
        }
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/ecs-cluster-userdata-template.sh`, variables);
}

/**
 * This function creates the ECS service role if it doesn't exist. This role is used by the
 * ECS service to interact with the ALB for auto-scaling and other things.
 */
export async function createEcsServiceRoleIfNotExists(accountConfig: AccountConfig) {
    const roleName = 'HandelEcsServiceRole';
    const trustedService = 'ecs.amazonaws.com';
    const policyStatementsToConsume = [
        {
            'Effect': 'Allow',
            'Action': [
                'ec2:AuthorizeSecurityGroupIngress',
                'ec2:Describe*',
                'elasticloadbalancing:DeregisterInstancesFromLoadBalancer',
                'elasticloadbalancing:DeregisterTargets',
                'elasticloadbalancing:Describe*',
                'elasticloadbalancing:RegisterInstancesWithLoadBalancer',
                'elasticloadbalancing:RegisterTargets'
            ],
            'Resource': [
                '*'
            ]
        }
    ];

    const role = await deployPhaseCommon.createCustomRole(trustedService, roleName, policyStatementsToConsume, accountConfig);
    return role;
}
