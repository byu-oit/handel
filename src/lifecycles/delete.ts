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
import * as winston from 'winston';
import * as util from '../common/util';
import { AccountConfig, DeployOrder, EnvironmentContext, EnvironmentDeleteResult, HandelFile, HandelFileParser, ServiceDeployers, UnBindContexts, UnDeployContexts } from '../datatypes';
import * as deployOrderCalc from '../deploy/deploy-order-calc';
import * as unBindPhase from '../phases/un-bind';
import * as unDeployPhase from '../phases/un-deploy';
import * as unPreDeployPhase from '../phases/un-pre-deploy';

async function unDeployAndUnBindServices(serviceDeployers: ServiceDeployers, environmentContext: EnvironmentContext, deployOrder: DeployOrder) {
    const unBindContexts: UnBindContexts = {};
    const unDeployContexts: UnDeployContexts = {};
    for (let currentLevel = deployOrder.length - 1; deployOrder[currentLevel]; currentLevel--) {
        // Un-deploy all services in the current level
        const levelUnDeployResults = await unDeployPhase.unDeployServicesInLevel(serviceDeployers, environmentContext, deployOrder, currentLevel);
        for (const serviceName in levelUnDeployResults) {
            if (levelUnDeployResults.hasOwnProperty(serviceName)) {
                unDeployContexts[serviceName] = levelUnDeployResults[serviceName];
            }
        }

        // Un-bind all services in the current level
        const levelUnBindResults = await unBindPhase.unBindServicesInLevel(serviceDeployers, environmentContext, deployOrder, currentLevel);
        for (const serviceName in levelUnBindResults) {
            if (levelUnBindResults.hasOwnProperty(serviceName)) {
                unBindContexts[serviceName] = levelUnBindResults[serviceName];
            }
        }
    }

    return {
        unBindContexts,
        unDeployContexts
    };
}

async function deleteEnvironment(accountConfig: AccountConfig, serviceDeployers: ServiceDeployers, environmentContext: EnvironmentContext): Promise<EnvironmentDeleteResult> {
    if (!accountConfig || !environmentContext) {
        return new EnvironmentDeleteResult('failure', 'Invalid configuration');
    }
    else {
        winston.info(`Starting delete for environment ${environmentContext.environmentName}`);

        try {
            const deployOrder = deployOrderCalc.getDeployOrder(environmentContext);
            const unDeployAndUnBindResults = await unDeployAndUnBindServices(serviceDeployers, environmentContext, deployOrder);
            const unPreDeployResults = await unPreDeployPhase.unPreDeployServices(serviceDeployers, environmentContext);
            return new EnvironmentDeleteResult('success', 'Success');
        }
        catch (err) {
            return new EnvironmentDeleteResult('failure', err.message, err);
        }
    }
}

export async function deleteEnv(accountConfig: AccountConfig, handelFile: HandelFile, environmentToDelete: string, handelFileParser: HandelFileParser, serviceDeployers: ServiceDeployers): Promise<EnvironmentDeleteResult> {
    // Run the delete on the environment specified
    const environmentContext = util.createEnvironmentContext(handelFile, handelFileParser, environmentToDelete, accountConfig);
    return deleteEnvironment(accountConfig, serviceDeployers, environmentContext);
}
