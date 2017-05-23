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
const ConsumeEventsContext = require('../datatypes/consume-events-context');
const util = require('../util/util');
const Promise = require('bluebird');

exports.consumeEvents = function(serviceDeployers, environmentContext, deployContexts) {
    winston.info(`Executing consume events phase on services in environment ${environmentContext.environmentName}`);

    let consumeEventActions = [];
    let consumeEventsContexts = {};

    winston.info(`Consuming internal events (if any) for services`);

    _.forEach(environmentContext.serviceContexts, function(producerServiceContext, producerServiceName) {
        if(producerServiceContext.params.event_consumers) { //Only look at those services producing events
            _.forEach(producerServiceContext.params.event_consumers, function(consumerService) {
                let consumerServiceName = consumerService.service_name;

                let consumerServiceContext = environmentContext.serviceContexts[consumerServiceName];
                consumeEventActions.push({
                    consumerServiceContext,
                    consumerDeployContext: deployContexts[consumerServiceName],
                    consumerServiceDeployer: serviceDeployers[consumerServiceContext.serviceType],
                    producerServiceContext,
                    producerDeployContext: deployContexts[producerServiceName]
                });
            });
        }
    });

    return Promise.mapSeries(consumeEventActions, action => {
        let consumeEventsContextName = util.getConsumeEventsContextName(action.consumerServiceContext.serviceName, action.producerServiceContext.serviceName);
        winston.info(`Consuming events from internal service ${consumeEventsContextName}`);
        return action.consumerServiceDeployer.consumeEvents(action.consumerServiceContext, action.consumerDeployContext, action.producerServiceContext, action.producerDeployContext)
            .then(consumeEventsContext => {
                if(!(consumeEventsContext instanceof ConsumeEventsContext)) {
                    throw new Error("Expected ConsumeEventsContext back from 'consumeEvents' phase of service deployer");
                }

                consumeEventsContexts[consumeEventsContextName] = consumeEventsContext;
            });
    })
    .then(() => {
        return consumeEventsContexts; //This was built-up dynamically above
    });
}