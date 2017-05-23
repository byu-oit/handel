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

/**
 * Recursive function to depth-first visit nodes, throwing an error if 
 * a circular dependency is found
 */
function visit(sorted, nodes, nodeToVisit) {
    if(nodeToVisit.temporaryMarked) {
        throw new Error("Circular dependency!");
    }
    if(!nodeToVisit.permanentMarked) {
        nodeToVisit.temporaryMarked = true;
        _.each(nodeToVisit.edges, function(edge) {
            visit(sorted, nodes, nodes[edge]);
        });
        nodeToVisit.permanentMarked = true;
        nodeToVisit.temporaryMarked = false;
        sorted.push(nodeToVisit.name);
    }
}


/**
 * Implements a depth-first topological sort in Javascript. See https://en.wikipedia.org/wiki/Topological_sorting
 *  for details on this algorithm.
 * 
 * Takes a list of node objects as parameters of the following structure:
 *    {
 *      name: <node_name>, //Name of this node
 *      edges: List<node_name>, //List of nodes to which this node has dependencies
 *      temporaryMarked: <boolean>, //Initialize to false, used internally
 *      permanentMarked: <boolean> //Initialize to false, used internally
 *    }
 * 
 * Returns a list of node names in topological sorted order, such as the following example:
 *   [ 'F', 'G', 'C', 'H', 'D', 'A', 'E', 'B' ]
 * 
 * Throws an error if there were circular dependencies
 */
module.exports = exports = function(nodes) {
    //Add internal fields to mark temporarily and permanently without altering original objects
    let internalNodes = {};
    _.forEach(nodes, function(node, nodeName) {
        internalNodes[nodeName] = {
            name: nodeName,
            edges: node.edges,
            temporaryMarked: false,
            permanentMarked: false
        };
    });

    //Perform topological sort
    let sorted = [];
    _.forEach(internalNodes, function(node, nodeName) {
        if(!node.permanentMarked) {
            visit(sorted, internalNodes, node);
        }
    });
    return sorted;
}