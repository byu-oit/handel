#!/bin/bash
echo "Adding instance to ECS cluster {{ECS_CLUSTER_NAME}}"
echo ECS_CLUSTER={{ECS_CLUSTER_NAME}} >> /etc/ecs/ecs.config

{{#each DEPENDENCY_SCRIPTS}}
{{{this}}}
{{/each}}

echo "Restarting Docker daemon and ECS service for services such as EFS that require a restart"
service docker restart
start ecs