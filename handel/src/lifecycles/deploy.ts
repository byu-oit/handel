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
import { AccountConfig, ServiceRegistry } from 'handel-extension-api';
import * as winston from 'winston';
import * as util from '../common/util';
import {
    BindContexts,
    DeployContexts,
    DeployOptions,
    DeployOrder,
    EnvironmentContext,
    EnvironmentDeployResult,
    HandelFile,
    HandelFileParser,
    PreDeployContexts
} from '../datatypes';
import * as deployOrderCalc from '../deploy/deploy-order-calc';
import * as bindPhase from '../phases/bind';
import * as checkPhase from '../phases/check';
import * as consumeEventsPhase from '../phases/consume-events';
import * as deployPhase from '../phases/deploy';
import * as preDeployPhase from '../phases/pre-deploy';
import * as produceEventsPhase from '../phases/produce-events';

async function setupEventBindings(serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext, deployContexts: DeployContexts) {
    const consumeEventsContexts = await consumeEventsPhase.consumeEvents(serviceRegistry, environmentContext, deployContexts);
    const produceEventsContexts = await produceEventsPhase.produceEvents(serviceRegistry, environmentContext, deployContexts);
    return {
        consumeEventsContexts: consumeEventsContexts,
        produceEventsContexts: produceEventsContexts
    };
}

async function bindAndDeployServices(serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext, preDeployContexts: PreDeployContexts, deployOrder: DeployOrder) {
    const bindContexts: BindContexts = {};
    const deployContexts: DeployContexts = {};
    for (let currentLevel = 0; deployOrder[currentLevel]; currentLevel++) {
        const levelBindResults = await bindPhase.bindServicesInLevel(serviceRegistry, environmentContext, preDeployContexts, deployOrder, currentLevel);
        for (const serviceName in levelBindResults) {
            if (levelBindResults.hasOwnProperty(serviceName)) {
                bindContexts[serviceName] = levelBindResults[serviceName];
            }
        }
        const levelDeployResults = await deployPhase.deployServicesInLevel(serviceRegistry, environmentContext, preDeployContexts, deployContexts, deployOrder, currentLevel);
        for (const serviceName in levelDeployResults) {
            if (levelDeployResults.hasOwnProperty(serviceName)) {
                deployContexts[serviceName] = levelDeployResults[serviceName];
            }
        }

    }

    return {
        bindContexts,
        deployContexts
    };
}

/**
 * Performs the actual deploy
 */
async function deployEnvironment(accountConfig: AccountConfig, serviceRegistry: ServiceRegistry, environmentContext: EnvironmentContext): Promise<EnvironmentDeployResult> {
    const startTime = Date.now();
    if (!accountConfig || !environmentContext) {
        return Promise.resolve(new EnvironmentDeployResult(
            !environmentContext ? 'invalid-env' : environmentContext.environmentName,
            startTime, 'failure', 'Invalid configuration', ));
    }
    else {
        winston.info(`Starting deploy for environment ${environmentContext.environmentName}`);

        const errors = await checkPhase.checkServices(serviceRegistry, environmentContext);
        if (errors.length === 0) {
            try {
                // Run pre-deploy (all services get run in parallel, regardless of level)
                const preDeployResults = await preDeployPhase.preDeployServices(serviceRegistry, environmentContext);
                // Deploy services (this will be done ordered levels at a time)
                const deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
                const bindAndDeployResults = await bindAndDeployServices(serviceRegistry, environmentContext, preDeployResults, deployOrder);
                const eventBindingResults = await setupEventBindings(serviceRegistry, environmentContext, bindAndDeployResults.deployContexts);
                return new EnvironmentDeployResult(environmentContext.environmentName, startTime, 'success', 'Success');
            }
            catch (err) {
                return new EnvironmentDeployResult(environmentContext.environmentName, startTime, 'failure', err.message, err);
            }
        }
        else {
            return new EnvironmentDeployResult(environmentContext.environmentName, startTime, 'failure', `Errors while checking deploy spec: \n${errors.join('\n')}`);
        }
    }
}

export async function deploy(accountConfig: AccountConfig, handelFile: HandelFile, environmentsToDeploy: string[], handelFileParser: HandelFileParser, serviceRegistry: ServiceRegistry, options: DeployOptions): Promise<EnvironmentDeployResult[]> {
    // Check current credentials against the accountConfig
    const envDeployPromises: Array<Promise<EnvironmentDeployResult>> = [];
    for (const environmentToDeploy of environmentsToDeploy) {
        const environmentContext = util.createEnvironmentContext(handelFile, handelFileParser, environmentToDeploy, accountConfig, serviceRegistry, options);
        envDeployPromises.push(deployEnvironment(accountConfig, serviceRegistry, environmentContext));
    }
    return Promise.all(envDeployPromises);
}
