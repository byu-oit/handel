#!/bin/bash
echo "Starting userdata script for Handel CodeDeploy instance"

{{#if codeDeployInstallScript}}
{{{codeDeployInstallScript}}}
{{/if}}

{{#each dependencyScripts}}
{{{this}}}
{{/each}}

echo "Finished Handel-generated startup script"