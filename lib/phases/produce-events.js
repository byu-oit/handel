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
const winston = require('winston');
const _ = require('lodash');
const ProduceEventsContext = require('../datatypes/produce-events-context');
const util = require('../common/util');
const Promise = require('bluebird');

let produceEvent = function(consumerServiceContext, consumerDeployContext, producerServiceContext, producerDeployContext, producerServiceDeployer) {
    winston.info(`Producing events from ${producerServiceContext.serviceName} for service ${consumerServiceContext.serviceName}`);
    return producerServiceDeployer.produceEvents(producerServiceContext, producerDeployContext, consumerServiceContext, consumerDeployContext)
        .then(produceEventsContext => {
            if(!(produceEventsContext instanceof ProduceEventsContext)) {
                throw new Error("Expected ProduceEventsContext back from 'produceEvents' phase of service deployer");
            }
            return produceEventsContext;
        });
}

exports.produceEvents = function(serviceDeployers, environmentContext, deployContexts) {
    winston.info(`Executing produce events phase on services in environment ${environmentContext.environmentName}`);

    let produceEventActions = [];
    let produceEventsContexts = {};

    _.forEach(environmentContext.serviceContexts, function(producerServiceContext, producerServiceName) {
        if(producerServiceContext.params.event_consumers) {
            _.forEach(producerServiceContext.params.event_consumers, function(consumerService) {
                //Get deploy info for producer service
                let producerDeployContext = deployContexts[producerServiceName];
                let producerServiceDeployer = serviceDeployers[producerServiceContext.serviceType];
                
                //Get deploy info for consumer service
                let consumerServiceName = consumerService.service_name;
                
                produceEventActions.push({
                    consumerServiceName,
                    producerServiceContext,
                    producerDeployContext,
                    producerServiceDeployer
                });
            });
        }
    });

    return Promise.mapSeries(produceEventActions, action => {
        let produceEventsContextName = util.getProduceEventsContextName(action.producerServiceContext.serviceName, action.consumerServiceName);

        let consumerServiceContext = environmentContext.serviceContexts[action.consumerServiceName];
        let consumerDeployContext = deployContexts[action.consumerServiceName];

        return produceEvent(consumerServiceContext, consumerDeployContext, action.producerServiceContext, action.producerDeployContext, action.producerServiceDeployer)
            .then(produceEventsContext => {
                produceEventsContexts[produceEventsContextName] = produceEventsContext;
            });
    })
    .then(() => {
        return produceEventsContexts; //This was built-up dynamically above
    });
}