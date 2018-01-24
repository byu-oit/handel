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
import * as _ from 'lodash';
import * as winston from 'winston';
import { DeployOrder, EnvironmentContext, ServiceContext, ServiceConfig } from '../datatypes/index';
import topologicalSort, { SortNodes } from './topological-sort';

function elementInLevels(element: string, levels: DeployOrder): boolean {
    let elementInLevel = false;
    _.forEach(levels, (level: string[]) => {
        if (_.includes(level, element)) {
            elementInLevel = true;
        }
    });
    return elementInLevel;
}

function stillHasElementsToAddToLevels(environmentContext: EnvironmentContext, levels: DeployOrder) {
    let elementsToAdd = false;
    _.forEach(environmentContext.serviceContexts, (serviceContext: ServiceContext<ServiceConfig>, serviceName: string) => {
        if (!elementInLevels(serviceName, levels)) {
            elementsToAdd = true;
        }
    });
    return elementsToAdd;
}

function getLevel(environmentContext: EnvironmentContext, currentLevel: number, previousLevels: DeployOrder) {
    const returnLevel: string[] = [];
    _.forEach(environmentContext.serviceContexts, (serviceContext: ServiceContext<ServiceConfig>, serviceName: string) => {
        const dependencies = serviceContext.params.dependencies;
        if (dependencies && dependencies.length > 0) { // If the element has dependencies, check whether it can be added to this level
            let addToThisLevel = true; // We'll add it to this level unless we find reason to do otherwise

            if (elementInLevels(serviceName, previousLevels)) { // Don't add it to this level if it's already been added in a previous level
                addToThisLevel = false;
            }
            else {
                // Look through each of its dependencies and if any of them are not in a previous level, then don't add this.
                // ALL dependencies of a service must be satisifed in a previous level before the service is deployed.
                _.forEach(dependencies, (dependency: string) => {
                    if (!elementInLevels(dependency, previousLevels)) {
                        addToThisLevel = false;
                    }
                });
            }

            if (addToThisLevel) {
                returnLevel.push(serviceName);
            }
        }
        else { // If the element has no dependencies, and hasn't already been added, add it in this level
            if (!elementInLevels(serviceName, previousLevels)) {
                returnLevel.push(serviceName);
            }
        }
    });

    return returnLevel;
}

/**
 * We only use the topological sort to check for circular dependencies, the results of The
 * sort are discarded. The reason for this is that there's no guarantee each level of the graph
 * will be colocated in the sorted array, so we don't know the full set of things that can be
 * deployed in each level. We could use the results, but it would result in a less effecient
 * strategy for deploying services in parallel.
 */
function hasCircularDependencies(environmentContext: EnvironmentContext): boolean {
    const nodes: SortNodes = {};
    _.forEach(environmentContext.serviceContexts, (serviceContext: ServiceContext<ServiceConfig>, serviceName: string) => {
        const internalDependencies: string[] = [];
        if (serviceContext.params.dependencies) {
            for (const dependency of serviceContext.params.dependencies) {
                internalDependencies.push(dependency);
            }
        }

        nodes[serviceName] = {
            name: serviceName,
            edges: internalDependencies
        };
    });

    try {
        topologicalSort(nodes);
        return false;
    }
    catch (e) { // Circular dependency error
        return true;
    }
}

/**
 * The way in which we calculate the deploy order is terribly inneficient, but
 * that doesn't matter because deploy specs have a small number of defined services
 */
export function getDeployOrder(environmentContext: EnvironmentContext): DeployOrder {
    const levels: DeployOrder = [];
    let currentLevel = 0;

    if (hasCircularDependencies(environmentContext)) {
        const errorMsg = `Your application has circular dependencies in your environment definition!`;
        winston.error(errorMsg);
        throw new Error(errorMsg);
    }

    while (stillHasElementsToAddToLevels(environmentContext, levels)) {
        const returnedLevel = getLevel(environmentContext, currentLevel, levels);
        levels.push(returnedLevel);
        currentLevel += 1;
    }

    return levels;
}
