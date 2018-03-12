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
import * as fs from 'fs';
import * as path from 'path';
import * as winston from 'winston';
import * as cloudFormationCalls from '../../aws/cloudformation-calls';
import * as deletePhasesCommon from '../../common/delete-phases-common';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as iamCalls from '../../aws/iam-calls';
import {getTags} from '../../common/tagging-common';
import * as handlebarsUtils from '../../common/handlebars-utils';
import * as util from '../../common/util';
import { HandlebarsStepFunctionsTemplate, StepFunctionsConfig } from './config-types';
import { DeployContext, PreDeployContext, ServiceConfig, ServiceContext, UnDeployContext } from '../../datatypes';

const SERVICE_NAME = 'Step Functions';

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<StepFunctionsConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
    const errors = [];

    // Check that definition is a valid JSON/YAML file
    if (!('definition' in serviceContext.params)) {
        errors.push(`${SERVICE_NAME} - The 'definition' parameter is required.`);
    } else if (path.extname(serviceContext.params.definition) === '.json') {
        if (util.readJsonFileSync(serviceContext.params.definition) === null) {
            errors.push(`${SERVICE_NAME} - ${serviceContext.params.definition} is not a valid JSON file.`);
        }
    } else if (['.yml', '.yaml'].includes(path.extname(serviceContext.params.definition))) {
        if (util.readYamlFileSync(serviceContext.params.definition) === null) {
            errors.push(`${SERVICE_NAME} - ${serviceContext.params.definition} is not a valid YAML file.`);
        }
    } else {
        errors.push(`${SERVICE_NAME} - The 'definition' parameter must have file extension .json, .yml, or .yaml.`);
    }

    return errors;
}

export async function deploy(ownServiceContext: ServiceContext<StepFunctionsConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Executing Deploy on '${stackName}'`);
    const compiledStepFunctionsTemplate = await getCompiledStepFunctionsTemplate(stackName, ownServiceContext, dependenciesDeployContexts);
    const stackTags = getTags(ownServiceContext);
    const deployedStack = await deployPhaseCommon.deployCloudFormationStack(stackName, compiledStepFunctionsTemplate, [], true, SERVICE_NAME, 30, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying '${stackName}'`);
    return getDeployContext(ownServiceContext, deployedStack);
}

export async function unDeploy(ownServiceContext: ServiceContext<StepFunctionsConfig>): Promise<UnDeployContext> {
    await iamCalls.detachPoliciesFromRole(deployPhaseCommon.getResourceName(ownServiceContext));
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

export const producedEventsSupportedServices = [];

export const producedDeployOutputTypes = ['environmentVariables', 'policies'];

export const consumedDeployOutputTypes = ['environmentVariables', 'policies'];

export const supportsTagging = false;

function generateDefinitionString(filename: string, dependenciesDeployContexts: DeployContext[]): string {
    const readFile = path.extname(filename) == '.json' ? util.readJsonFileSync : util.readYamlFileSync;
    const definitionFile = readFile(filename);
    const dependencyArns: Map<string, string> = new Map();
    // Map service name to ARN
    for (const context of dependenciesDeployContexts) {
        dependencyArns.set(context.serviceName, context.eventOutputs.lambdaArn);
    }
    // Change 'resource' in each state from service name to ARN
    for (const state_name in definitionFile.States) {
        const state = definitionFile.States[state_name];
        if (definitionFile.States.hasOwnProperty(state_name) && 'Resource' in state) {
            state.Resource = dependencyArns.get(state.Resource);
        }
    }
    return JSON.stringify(definitionFile);
}

function getCompiledStepFunctionsTemplate(stackName: string, ownServiceContext: ServiceContext<StepFunctionsConfig>, dependenciesDeployContexts: DeployContext[]): Promise<string> {
    const definitionString = generateDefinitionString(ownServiceContext.params.definition, dependenciesDeployContexts);
    const policyStatements = deployPhaseCommon.getAllPolicyStatementsForServiceRole([], dependenciesDeployContexts);
    const handlebarsParams: HandlebarsStepFunctionsTemplate = {
        stateMachineName: stackName,
        definitionString,
        policyStatements
    };
    return handlebarsUtils.compileTemplate(`${__dirname}/stepfunctions-template.yml`, handlebarsParams);
}

function getDeployContext(serviceContext: ServiceContext<StepFunctionsConfig>, cfStack: AWS.CloudFormation.Stack): DeployContext {
    const deployContext = new DeployContext(serviceContext);
    const stateMachineArn = cloudFormationCalls.getOutput('StateMachineArn', cfStack);
    const stateMachineName = cloudFormationCalls.getOutput('StateMachineName', cfStack);
    // Output policy for consuming this state machine
    deployContext.policies.push({
        'Effect': 'Allow',
        'Action': [
            'states:StartExecution',
            'states:StopExecution'
        ],
        'Resource': [
            stateMachineArn
        ]
    });

    // Inject env vars
    deployContext.addEnvironmentVariables(deployPhaseCommon.getInjectedEnvVarsFor(serviceContext, {
        STATE_MACHINE_ARN: stateMachineArn,
        STATE_MACHINE_NAME: stateMachineName
    }));

    // Inject event outputs
    deployContext.eventOutputs.stateMachineArn = stateMachineArn;
    deployContext.eventOutputs.stateMachineName = stateMachineName;

    return deployContext;
}
