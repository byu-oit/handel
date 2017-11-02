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