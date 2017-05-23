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
const _ = require('lodash');
const winston = require('winston');
const topologicalSort = require('./topological-sort');

function elementInLevels(element, levels) {
    let elementInLevel = false;
    _.forEach(levels, function(level) {
        if(_.includes(level, element)) {
            elementInLevel = true;
        }
    });
    return elementInLevel;
}

function stillHasElementsToAddToLevels(environmentContext, levels) {
    let elementsToAdd = false;
    _.forEach(environmentContext.serviceContexts, function(serviceContext, serviceName) {
        if(!elementInLevels(serviceName, levels)) {
            elementsToAdd = true;
        }
    });
    return elementsToAdd;
}

function getLevel(environmentContext, currentLevel, previousLevels) {
    let returnLevel = [];
    _.forEach(environmentContext.serviceContexts, function(serviceContext, serviceName) {
        let dependencies = serviceContext.params.dependencies;
        if(dependencies && dependencies.length > 0) {
            let addToThisLevel = true;
            if(elementInLevels(serviceName, previousLevels)) {
                addToThisLevel = false;
            }
            else {
                _.forEach(dependencies, function(dependency) {
                    if(!elementInLevels(dependency, previousLevels)) {
                        addToThisLevel = false;
                    }
                });
            }

            if(addToThisLevel) {
                returnLevel.push(serviceName);
            }
        }
        else {
            if(!elementInLevels(serviceName, previousLevels)) {
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
function hasCircularDependencies(environmentContext) {
    let nodes = {}
    _.forEach(environmentContext.serviceContexts, function(serviceContext, serviceName) {
        let internalDependencies = [];
        if(serviceContext.params.dependencies) {
            for(let dependency of serviceContext.params.dependencies) {
                internalDependencies.push(dependency);
            }
        }

        nodes[serviceName] = {
            name: serviceName,
            edges: internalDependencies,
        };
    });

    try {
        topologicalSort(nodes);
        return false;
    }
    catch(e) { //Circular dependency error
        return true;
    }
}

/**
 * The way in which we calculate the deploy order is terribly inneficient, but
 * that doesn't matter because deploy specs have a small number of defined services
 */
exports.getDeployOrder = function(environmentContext) {
    let levels = []
    let currentLevel = 0;

    if(hasCircularDependencies(environmentContext)) {
        let errorMsg = "Your application has circular dependencies in your environment definition!"
        winston.error(errorMsg);
        throw new Error(errorMsg);
    }

    while(stillHasElementsToAddToLevels(environmentContext, levels)) {
        let returnedLevel = getLevel(environmentContext, currentLevel, levels);
        levels.push(returnedLevel);
        currentLevel += 1;
    }

    return levels;
}