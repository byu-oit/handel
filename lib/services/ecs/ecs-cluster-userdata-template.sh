#!/bin/bash
echo "Adding instance to ecs cluster {{ECS_CLUSTER_NAME}}"
echo ECS_CLUSTER={{ECS_CLUSTER_NAME}} >> /etc/ecs/ecs.config

{{#each DEPENDENCY_SCRIPTS}}
{{{this}}}
{{/each}}
