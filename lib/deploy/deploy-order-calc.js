const _ = require('lodash');
const winston = require('winston');
const topologicalSort = require('../util/topological-sort');

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
    //TODO - Check for circular dependencies

    let returnLevel = [];
    if(currentLevel == 0) {
        _.forEach(environmentContext.serviceContexts, function(serviceContext, serviceName) {
            let dependencies = serviceContext.params.dependencies;
            if(!dependencies || dependencies.length === 0) {
                returnLevel.push(serviceName);
            }
        });
    }
    else {
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
        });
    }

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
        nodes[serviceName] = {
            name: serviceName,
            edges: serviceContext.params.dependencies,
        };
    });

    try {
        topologicalSort(nodes);
        return false;
    }
    catch(e) { //Circular dependency error
        winston.error(e);
        return true;
    }
}

/**
 * The way in which we calculate the deploy order is terribly inneficient, but
 * that doesn't matter because deploy specs have a small number of defined services
 */
exports.getDeployOrder = function(environmentContext, current) {
    let levels = []
    let currentLevel = 0;

    if(hasCircularDependencies(environmentContext)) {
        console.log("Circular dependencies!");
        process.exit(1);
    }

    while(stillHasElementsToAddToLevels(environmentContext, levels)) {
        let returnedLevel = getLevel(environmentContext, currentLevel, levels);
        levels.push(returnedLevel);
        currentLevel += 1;
    }

    return levels;
}