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
const deployPhaseCommon = require('../../common/deploy-phase-common');
const handlebarsUtils = require('../../common/handlebars-utils');

/**
 * This function calculates the user data script to be run on the cluster EC2 instances when launching.
 * 
 * This script is calculated from the injected scripts from any dependencies that export them, such as EFS.
 */
exports.getUserDataScript = function(clusterName, dependenciesDeployContexts) {
    let variables = {
        ECS_CLUSTER_NAME: clusterName,
        DEPENDENCY_SCRIPTS: []
    }

    for (let deployContext of dependenciesDeployContexts) {
        for (let script of deployContext.scripts) {
            variables.DEPENDENCY_SCRIPTS.push(script);
        }
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/ecs-cluster-userdata-template.sh`, variables);
}

/**
 * This function creates the ECS service role if it doesn't exist. This role is used by the
 * ECS service to interact with the ALB for auto-scaling and other things.
 */
exports.createEcsServiceRoleIfNotExists = function(accountConfig) {
    let roleName = 'HandelEcsServiceRole';
    let trustedService = 'ecs.amazonaws.com';
    let policyStatementsToConsume = [
        {
            "Effect": "Allow",
            "Action": [
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:Describe*",
                "elasticloadbalancing:DeregisterInstancesFromLoadBalancer",
                "elasticloadbalancing:DeregisterTargets",
                "elasticloadbalancing:Describe*",
                "elasticloadbalancing:RegisterInstancesWithLoadBalancer",
                "elasticloadbalancing:RegisterTargets"
            ],
            "Resource": [
                "*"
            ]
        }
    ]

    return deployPhaseCommon.createCustomRole(trustedService, roleName, policyStatementsToConsume, accountConfig)
        .then(role => {
            return role;
        });
}